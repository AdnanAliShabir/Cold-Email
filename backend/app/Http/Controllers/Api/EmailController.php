<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Email;
use App\Models\Lead;
use App\Services\ResendMailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class EmailController extends Controller
{
    public function __construct(private ResendMailService $resend) {}

    public function index(Request $request): JsonResponse
    {
        $emails = Email::with('lead.company', 'template')
            ->where('user_id', $request->user()->id)
            ->when($request->filled('lead_id'), fn ($q) => $q->where('lead_id', $request->query('lead_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->query('status')))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json($emails);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_id' => ['required', 'exists:leads,id'],
            'template_id' => ['nullable', 'exists:email_templates,id'],
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string'],
            'status' => ['sometimes', 'in:'.implode(',', Email::STATUSES)],
            'send' => ['sometimes', 'boolean'],
        ]);

        $lead = Lead::with('contact')->findOrFail($data['lead_id']);
        abort_unless($lead->user_id === $request->user()->id, 403, 'Not authorized');

        $shouldSend = (bool) ($data['send'] ?? false);
        $toEmail = $lead->contact?->email;

        if ($shouldSend && ! $toEmail) {
            return response()->json(['message' => 'Lead has no contact email'], 422);
        }

        $email = Email::create([
            'user_id' => $request->user()->id,
            'lead_id' => $data['lead_id'],
            'template_id' => $data['template_id'] ?? null,
            'direction' => 'outbound',
            'subject' => $data['subject'],
            'body' => $data['body'],
            'from_email' => config('mail.from.address'),
            'to_email' => $toEmail,
            'status' => $shouldSend ? 'sent' : ($data['status'] ?? 'draft'),
            'sent_at' => $shouldSend ? now() : null,
            'provider' => $shouldSend ? 'resend' : null,
        ]);

        if ($shouldSend) {
            try {
                $messageId = $this->deliver($email);
                $email->update([
                    'status' => 'sent',
                    'sent_at' => now(),
                    'provider' => config('services.resend.key') ? 'resend' : config('mail.default'),
                    'provider_message_id' => $messageId,
                ]);
            } catch (\Throwable $e) {
                Log::error('Email send failed', ['email_id' => $email->id, 'error' => $e->getMessage()]);
                $email->update(['status' => 'draft', 'sent_at' => null, 'provider' => null]);

                return response()->json([
                    'message' => 'Failed to send email: '.$e->getMessage(),
                    'email' => $email->fresh()->load('lead.company', 'template'),
                ], 502);
            }

            $lead->update(['last_contacted_at' => now(), 'status' => 'active']);
            $lead->activities()->create([
                'user_id' => $lead->user_id,
                'type' => 'email_sent',
                'description' => "Email sent: {$email->subject}",
            ]);
        }

        return response()->json(['email' => $email->fresh()->load('lead.company', 'template')], 201);
    }

    public function updateStatus(Request $request, Email $email): JsonResponse
    {
        abort_unless($email->user_id === $request->user()->id, 403, 'Not authorized');

        $status = $request->validate(['status' => ['required', 'in:'.implode(',', Email::STATUSES)]])['status'];

        $timestamps = [
            'sent' => 'sent_at',
            'opened' => 'opened_at',
            'clicked' => 'clicked_at',
            'replied' => 'replied_at',
        ];

        $email->update([
            'status' => $status,
            $timestamps[$status] ?? 'sent_at' => now(),
        ]);

        return response()->json(['email' => $email->fresh()]);
    }

    private function deliver(Email $email): ?string
    {
        if (config('services.resend.key')) {
            return $this->resend->send($email);
        }

        // Local/dev fallback: log driver (no real delivery, no provider id)
        Mail::raw($email->body, function ($message) use ($email) {
            $message->to($email->to_email)->subject($email->subject);
        });

        return null;
    }
}
