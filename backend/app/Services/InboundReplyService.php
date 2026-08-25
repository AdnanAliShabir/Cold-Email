<?php

namespace App\Services;

use App\Models\Contact;
use App\Models\Email;
use App\Models\Lead;
use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class InboundReplyService
{
    private const DIR_OUT = 'out'.'bound';

    private const DIR_IN = 'in'.'bound';

    /**
     * Handle a Resend inbound webhook payload (`data` object).
     * Event type is email.received (also accepts the older email.received name).
     */
    public function handle(array $data): array
    {
        $receivedId = $data['email_id'] ?? $data['id'] ?? null;
        if (! $receivedId) {
            return ['stored' => false, 'reason' => 'missing_email_id'];
        }

        if (Email::where('provider_message_id', $receivedId)->where('direction', self::DIR_IN)->exists()) {
            return ['stored' => false, 'reason' => 'duplicate'];
        }

        $detail = $this->fetchReceived($receivedId) ?? $data;
        $from = $this->extractAddress($detail['from'] ?? $data['from'] ?? null);
        $toList = $this->extractAddressList($detail['to'] ?? $data['to'] ?? []);
        $subject = (string) ($detail['subject'] ?? $data['subject'] ?? '(no subject)');
        $body = $this->plainBody($detail);

        $original = $this->matchOriginalEmail($from, $toList, $subject, $detail['headers'] ?? []);

        if (! $original) {
            Log::info('Inbound reply unmatched', [
                'received_id' => $receivedId,
                'from' => $from,
                'to' => $toList,
                'subject' => $subject,
            ]);

            return ['stored' => false, 'reason' => 'unmatched', 'from' => $from];
        }

        $inbound = Email::create([
            'user_id' => $original->user_id,
            'lead_id' => $original->lead_id,
            'template_id' => null,
            'in_reply_to_email_id' => $original->id,
            'direction' => self::DIR_IN,
            'subject' => $subject,
            'body' => $body !== '' ? $body : '(empty body)',
            'from_email' => $from,
            'from_name' => $this->extractName($detail['from'] ?? $data['from'] ?? null),
            'to_email' => $toList[0] ?? $original->from_email,
            'provider_message_id' => $receivedId,
            'provider' => 'resend',
            'status' => 'received',
            'sent_at' => now(),
        ]);

        $original->update([
            'status' => 'replied',
            'replied_at' => $original->replied_at ?? now(),
        ]);

        $original->lead?->activities()->create([
            'user_id' => $original->user_id,
            'type' => 'email_replied',
            'description' => "Reply received: {$subject}",
        ]);

        $this->maybeForward($original, $subject, $body);

        return [
            'stored' => true,
            'crm_email_id' => $inbound->id,
            'lead_id' => $original->lead_id,
            'in_reply_to' => $original->id,
        ];
    }

    public function replyToAddress(Email $email): ?string
    {
        $from = $email->from_email ?: config('mail.from.address');
        if (! is_string($from) || ! str_contains($from, '@')) {
            return null;
        }

        [$local] = explode('@', $from, 2);
        $local = explode('+', $local, 2)[0];
        if ($local === '') {
            $local = 'reply';
        }

        // Prefer Resend receiving subdomain so Reply goes to Resend, not root MX
        $settings = Setting::mapForUser((int) $email->user_id);
        $domain = trim((string) ($settings['reply_receiving_domain'] ?? ''));
        if ($domain === '') {
            $domain = trim((string) config('services.resend.receiving_domain', ''));
        }
        if ($domain === '') {
            $domain = explode('@', $from, 2)[1] ?? '';
        }
        $domain = strtolower(ltrim($domain, '@'));
        if ($domain === '') {
            return null;
        }

        return "{$local}+e{$email->id}@{$domain}";
    }

    private function fetchReceived(string $id): ?array
    {
        $apiKey = config('services.resend.key');
        if (! $apiKey) {
            return null;
        }

        try {
            $response = Http::withToken($apiKey)
                ->acceptJson()
                ->timeout(20)
                ->get('https://api.resend.com/emails/receiving/'.$id);

            if (! $response->successful()) {
                Log::warning('Resend received-email fetch failed', [
                    'id' => $id,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return null;
            }

            return $response->json();
        } catch (\Throwable $e) {
            Log::warning('Resend received-email fetch error', [
                'id' => $id,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function matchOriginalEmail(?string $from, array $toList, string $subject, mixed $headers): ?Email
    {
        foreach ($toList as $to) {
            if (preg_match('/(?:^|\+)e(\d+)@/i', $to, $m)) {
                $email = Email::where('id', (int) $m[1])->where('direction', self::DIR_OUT)->first();
                if ($email) {
                    return $email;
                }
            }
        }

        $inReplyTo = $this->headerValue($headers, 'in-reply-to');
        if ($inReplyTo) {
            $email = Email::where('provider_message_id', trim($inReplyTo, '<> '))->first();
            if ($email && $email->direction === self::DIR_OUT) {
                return $email;
            }
        }

        if ($from) {
            $contactIds = Contact::query()
                ->whereRaw('LOWER(email) = ?', [strtolower($from)])
                ->pluck('id');

            if ($contactIds->isNotEmpty()) {
                $leadIds = Lead::whereIn('contact_id', $contactIds)->pluck('id');
                $email = Email::query()
                    ->whereIn('lead_id', $leadIds)
                    ->where('direction', self::DIR_OUT)
                    ->orderByDesc('id')
                    ->first();
                if ($email) {
                    return $email;
                }
            }
        }

        $normalized = $this->normalizeSubject($subject);
        if ($normalized !== '') {
            return Email::query()
                ->where('direction', self::DIR_OUT)
                ->whereRaw('LOWER(subject) = ?', [strtolower($normalized)])
                ->orderByDesc('id')
                ->first();
        }

        return null;
    }

    private function maybeForward(Email $original, string $subject, string $body): void
    {
        $settings = Setting::mapForUser($original->user_id);
        $forwardTo = trim((string) ($settings['reply_forward_to'] ?? ''));
        if ($forwardTo === '' || ! filter_var($forwardTo, FILTER_VALIDATE_EMAIL)) {
            return;
        }

        $apiKey = config('services.resend.key');
        $from = $original->from_email ?: config('mail.from.address');
        if (! $apiKey || ! $from) {
            return;
        }

        $fwdSubject = Str::startsWith(strtolower($subject), 'fwd:') ? $subject : 'Fwd: '.$subject;

        try {
            $response = Http::withToken($apiKey)
                ->acceptJson()
                ->asJson()
                ->timeout(20)
                ->post('https://api.resend.com/emails', [
                    'from' => ($original->from_name ? "{$original->from_name} <{$from}>" : $from),
                    'to' => [$forwardTo],
                    'subject' => $fwdSubject,
                    'text' => "Forwarded CRM reply from {$original->to_email}:\n\n{$body}",
                ]);

            if (! $response->successful()) {
                Log::warning('Failed to forward inbound reply', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('Forward inbound reply error', ['error' => $e->getMessage()]);
        }
    }

    private function plainBody(array $detail): string
    {
        $text = trim((string) ($detail['text'] ?? ''));
        if ($text !== '') {
            return Str::limit($text, 20000, '…');
        }

        $html = (string) ($detail['html'] ?? '');
        if ($html === '') {
            return '';
        }

        $stripped = html_entity_decode(strip_tags(str_replace(['<br>', '<br/>', '<br />', '</p>'], "\n", $html)));

        return Str::limit(trim(preg_replace("/[ \t]+\n/", "\n", $stripped) ?? $stripped), 20000, '…');
    }

    private function extractAddress(mixed $value): ?string
    {
        if (is_array($value)) {
            $value = $value[0] ?? null;
        }
        if (! is_string($value) || $value === '') {
            return null;
        }
        if (preg_match('/<([^>]+)>/', $value, $m)) {
            return strtolower(trim($m[1]));
        }

        return strtolower(trim($value));
    }

    /** @return list<string> */
    private function extractAddressList(mixed $value): array
    {
        if (is_string($value)) {
            $value = [$value];
        }
        if (! is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $item) {
            $addr = $this->extractAddress($item);
            if ($addr) {
                $out[] = $addr;
            }
        }

        return $out;
    }

    private function extractName(mixed $value): ?string
    {
        if (is_array($value)) {
            $value = $value[0] ?? null;
        }
        if (! is_string($value) || ! str_contains($value, '<')) {
            return null;
        }

        $name = trim(explode('<', $value, 2)[0], " \t\"'");

        return $name !== '' ? $name : null;
    }

    private function headerValue(mixed $headers, string $name): ?string
    {
        if (! is_array($headers)) {
            return null;
        }

        foreach ($headers as $key => $value) {
            if (is_string($key) && strcasecmp($key, $name) === 0) {
                return is_string($value) ? $value : null;
            }
            if (is_array($value)) {
                $hName = $value['name'] ?? $value['key'] ?? null;
                $hValue = $value['value'] ?? null;
                if (is_string($hName) && strcasecmp($hName, $name) === 0 && is_string($hValue)) {
                    return $hValue;
                }
            }
        }

        return null;
    }

    private function normalizeSubject(string $subject): string
    {
        return trim(preg_replace('/^(re|fw|fwd)\s*:\s*/i', '', $subject) ?? $subject);
    }
}
