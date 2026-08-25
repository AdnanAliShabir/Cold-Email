<?php

namespace App\Services;

use App\Models\Email;
use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class ResendMailService
{
    public function send(Email $email, ?string $fromName = null, ?string $fromAddress = null): string
    {
        $apiKey = config('services.resend.key');
        if (! $apiKey) {
            throw new RuntimeException('RESEND_API_KEY is not configured');
        }

        if (! $email->to_email) {
            throw new RuntimeException('Lead has no contact email');
        }

        $fromAddress = $fromAddress
            ?: $email->from_email
            ?: config('mail.from.address');

        $fromName = $fromName
            ?: $email->from_name
            ?: config('mail.from.name', 'LeadCRM');

        $from = $fromName ? "{$fromName} <{$fromAddress}>" : $fromAddress;

        $html = nl2br(e($email->body));

        $payload = [
            'from' => $from,
            'to' => [$email->to_email],
            'subject' => $email->subject,
            'text' => $email->body,
            'html' => "<div style=\"font-family:sans-serif;font-size:14px;line-height:1.5;color:#111\">{$html}</div>",
            'tags' => [
                ['name' => 'crm_email_id', 'value' => (string) $email->id],
                ['name' => 'lead_id', 'value' => (string) $email->lead_id],
            ],
        ];

        $replyTo = app(InboundReplyService::class)->replyToAddress($email);
        if ($replyTo) {
            $payload['reply_to'] = [$replyTo];
        }

        $response = Http::withToken($apiKey)
            ->acceptJson()
            ->asJson()
            ->post('https://api.resend.com/emails', $payload);

        if (! $response->successful()) {
            $detail = $response->json('message') ?? $response->body();
            throw new RuntimeException('Resend send failed: '.$detail);
        }

        $id = $response->json('id');
        if (! $id) {
            throw new RuntimeException('Resend did not return a message id');
        }

        return $id;
    }

    /** Resolve from-name / from-email for a user from settings + env defaults. */
    public static function resolveFrom(int $userId): array
    {
        $settings = Setting::mapForUser($userId);
        $senderName = trim((string) ($settings['sender_name'] ?? ''));
        $companyName = trim((string) ($settings['company_name'] ?? ''));
        $fromEmail = trim((string) ($settings['from_email'] ?? ''));

        return [
            'from_name' => $senderName !== ''
                ? $senderName
                : (config('mail.from.name') ?: 'LeadCRM'),
            'from_email' => $fromEmail !== ''
                ? $fromEmail
                : config('mail.from.address'),
            'company_name' => $companyName !== '' ? $companyName : null,
        ];
    }
}
