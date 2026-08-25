<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\EmailTrackingService;
use App\Services\InboundReplyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ResendWebhookController extends Controller
{
    public function __construct(
        private EmailTrackingService $tracking,
        private InboundReplyService $inbound,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $secret = config('services.resend.webhook_secret');
        if ($secret) {
            $svixId = $request->header('svix-id');
            $svixTimestamp = $request->header('svix-timestamp');
            $svixSignature = $request->header('svix-signature');
            if (! $this->verifySvix($secret, $svixId, $svixTimestamp, $svixSignature, $request->getContent())) {
                Log::warning('Resend webhook signature verification failed', [
                    'has_svix_id' => (bool) $svixId,
                    'has_timestamp' => (bool) $svixTimestamp,
                    'has_signature' => (bool) $svixSignature,
                ]);

                return response()->json(['message' => 'Invalid signature'], 401);
            }
        }

        $type = $request->input('type');
        $data = $request->input('data', []);
        if (! is_array($data)) {
            $data = [];
        }

        if (! $type) {
            return response()->json(['ok' => true, 'ignored' => true]);
        }

        if (is_string($type) && str_contains($type, 'received')) {
            $result = $this->inbound->handle($data);

            return response()->json(['ok' => true, 'type' => $type] + $result);
        }

        $email = $this->tracking->findEmailFromWebhookPayload($data);

        if (! $email) {
            Log::info('Resend webhook unmatched', [
                'type' => $type,
                'email_id' => $data['email_id'] ?? $data['id'] ?? null,
                'tags' => $data['tags'] ?? null,
            ]);

            return response()->json(['ok' => true, 'matched' => false]);
        }

        $updated = match ($type) {
            'email.opened' => $this->tracking->applyEvent($email, 'opened'),
            'email.clicked' => $this->tracking->applyEvent($email, 'clicked'),
            'email.bounced', 'email.failed', 'email.complained', 'email.suppressed' => $this->logDeliveryIssue($email, $type),
            default => false,
        };

        return response()->json([
            'ok' => true,
            'matched' => true,
            'updated' => (bool) $updated,
            'type' => $type,
            'crm_email_id' => $email->id,
        ]);
    }

    private function logDeliveryIssue($email, string $type): bool
    {
        $email->lead?->activities()->create([
            'user_id' => $email->user_id,
            'type' => str_replace('.', '_', $type),
            'description' => "Email event {$type}: {$email->subject}",
        ]);

        return true;
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
