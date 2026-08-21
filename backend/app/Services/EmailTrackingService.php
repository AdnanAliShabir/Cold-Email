<?php

namespace App\Services;

use App\Models\Email;
use App\Models\Lead;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EmailTrackingService
{
    /**
     * Apply a Resend (or similar) tracking event onto an Email row.
     * Hierarchy: clicked > opened > sent (never downgrade replied).
     */
    public function applyEvent(Email $email, string $event): bool
    {
        $event = strtolower(trim($event));
        // Normalize Resend last_event / webhook type
        $event = str_replace('email.', '', $event);

        if (in_array($email->status, ['replied'], true)) {
            return false;
        }

        if ($event === 'clicked') {
            $email->update([
                'status' => 'clicked',
                'clicked_at' => $email->clicked_at ?? now(),
                'opened_at' => $email->opened_at ?? now(),
            ]);

            return true;
        }

        if (in_array($event, ['opened', 'open'], true)) {
            if ($email->status === 'clicked') {
                if (! $email->opened_at) {
                    $email->update(['opened_at' => now()]);
                }

                return false;
            }

            $email->update([
                'status' => 'opened',
                'opened_at' => $email->opened_at ?? now(),
            ]);

            return true;
        }

        return false;
    }

    /**
     * Resolve CRM email from webhook payload (message id + tags).
     */
    public function findEmailFromWebhookPayload(array $data): ?Email
    {
        $messageId = $data['email_id'] ?? $data['id'] ?? null;

        if ($messageId) {
            $email = Email::where('provider_message_id', $messageId)->first();
            if ($email) {
                return $email;
            }
        }

        $crmId = $this->extractTag($data['tags'] ?? null, 'crm_email_id');
        if ($crmId) {
            return Email::find($crmId);
        }

        return null;
    }

    /**
     * Tags may be object {"crm_email_id":"1"} or list [{"name":"crm_email_id","value":"1"}].
     */
    public function extractTag(mixed $tags, string $name): ?string
    {
        if (! is_array($tags)) {
            return null;
        }

        // Object / associative map (Resend webhook format)
        if (array_key_exists($name, $tags) && ! is_array($tags[$name])) {
            $value = $tags[$name];

            return $value !== null && $value !== '' ? (string) $value : null;
        }

        foreach ($tags as $tag) {
            if (! is_array($tag)) {
                continue;
            }
            $tagName = $tag['name'] ?? null;
            $tagValue = $tag['value'] ?? null;
            if ($tagName === $name && $tagValue !== null && $tagValue !== '') {
                return (string) $tagValue;
            }
        }

        return null;
    }

    /**
     * Pull last_event from Resend for outbound emails still at "sent".
     */
    public function syncLead(Lead $lead, int $limit = 15): int
    {
        $apiKey = config('services.resend.key');
        if (! $apiKey) {
            return 0;
        }

        $emails = Email::query()
            ->where('lead_id', $lead->id)
            ->where('provider', 'resend')
            ->whereNotNull('provider_message_id')
            ->whereIn('status', ['sent', 'opened'])
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        $updated = 0;

        foreach ($emails as $email) {
            if ($this->syncEmailFromResend($email, $apiKey)) {
                $updated++;
            }
        }

        return $updated;
    }

    public function syncEmailFromResend(Email $email, ?string $apiKey = null): bool
    {
        $apiKey ??= config('services.resend.key');
        if (! $apiKey || ! $email->provider_message_id) {
            return false;
        }

        try {
            $response = Http::withToken($apiKey)
                ->acceptJson()
                ->timeout(12)
                ->get('https://api.resend.com/emails/'.$email->provider_message_id);

            if (! $response->successful()) {
                Log::info('Resend email lookup failed', [
                    'email_id' => $email->id,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                return false;
            }

            $lastEvent = $response->json('last_event');
            if (! is_string($lastEvent) || $lastEvent === '') {
                return false;
            }

            return $this->applyEvent($email->fresh(), $lastEvent);
        } catch (\Throwable $e) {
            Log::warning('Resend sync error', [
                'email_id' => $email->id,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }
}
