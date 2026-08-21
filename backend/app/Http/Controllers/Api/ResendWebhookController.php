<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Email;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ResendWebhookController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $secret = config('services.resend.webhook_secret');
        if ($secret) {
            $svixId = $request->header('svix-id');
            $svixTimestamp = $request->header('svix-timestamp');
            $svixSignature = $request->header('svix-signature');
            if (! $this->verifySvix($secret, $svixId, $svixTimestamp, $svixSignature, $request->getContent())) {
                Log::warning('Resend webhook signature verification failed');

                return response()->json(['message' => 'Invalid signature'], 401);
            }
        }

        $type = $request->input('type');
        $data = $request->input('data', []);
        $messageId = $data['email_id'] ?? $data['id'] ?? null;

        if (! $messageId || ! $type) {
            return response()->json(['ok' => true, 'ignored' => true]);
        }

        $email = Email::where('provider_message_id', $messageId)->first();

        if (! $email && ! empty($data['tags'])) {
            foreach ((array) $data['tags'] as $tag) {
                $name = is_array($tag) ? ($tag['name'] ?? null) : null;
                $value = is_array($tag) ? ($tag['value'] ?? null) : null;
                if ($name === 'crm_email_id' && $value) {
                    $email = Email::find($value);
                    break;
                }
            }
        }

        if (! $email) {
            return response()->json(['ok' => true, 'matched' => false]);
        }

        match ($type) {
            'email.opened' => $this->markOpened($email),
            'email.clicked' => $this->markClicked($email),
            'email.bounced', 'email.failed', 'email.complained', 'email.suppressed' => $this->logDeliveryIssue($email, $type),
            default => null,
        };

        return response()->json(['ok' => true, 'matched' => true, 'type' => $type]);
    }

    private function markOpened(Email $email): void
    {
        if ($email->opened_at) {
            return;
        }

        $email->update([
            'status' => 'opened',
            'opened_at' => now(),
        ]);
    }

    private function markClicked(Email $email): void
    {
        $email->update([
            'status' => 'clicked',
            'clicked_at' => now(),
            'opened_at' => $email->opened_at ?? now(),
        ]);
    }

    private function logDeliveryIssue(Email $email, string $type): void
    {
        $email->lead?->activities()->create([
            'user_id' => $email->user_id,
            'type' => str_replace('.', '_', $type),
            'description' => "Email event {$type}: {$email->subject}",
        ]);
    }

    /**
     * Resend uses Svix-style signatures (whsec_...).
     */
    private function verifySvix(?string $secret, ?string $id, ?string $timestamp, ?string $signatureHeader, string $payload): bool
    {
        if (! $secret || ! $id || ! $timestamp || ! $signatureHeader) {
            return false;
        }

        if (abs(time() - (int) $timestamp) > 300) {
            return false;
        }

        $secretPart = str_starts_with($secret, 'whsec_') ? substr($secret, 6) : $secret;
        $key = base64_decode($secretPart, true);
        if ($key === false) {
            $key = $secretPart;
        }

        $toSign = "{$id}.{$timestamp}.{$payload}";
        $expected = base64_encode(hash_hmac('sha256', $toSign, $key, true));

        foreach (explode(' ', $signatureHeader) as $part) {
            if (str_starts_with($part, 'v1,')) {
                $sig = substr($part, 3);
                if (hash_equals($expected, $sig)) {
                    return true;
                }
            }
        }

        return false;
    }
}
