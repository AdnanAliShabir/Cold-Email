<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Email;
use App\Models\Lead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class EmailController extends Controller
{
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
            'status' => ['sometimes', 'in:' . implode(',', Email::STATUSES)],
            'send' => ['sometimes', 'boolean'],
        ]);

        $lead = Lead::findOrFail($data['lead_id']);
        abort_unless($lead->user_id === $request->user()->id, 403, 'Not authorized');

        $email = Email::create([
            'user_id' => $request->user()->id,
            'lead_id' => $data['lead_id'],
            'template_id' => $data['template_id'] ?? null,
            'direction' => 'outbound',
            'subject' => $data['subject'],
            'body' => $data['body'],
            'to_email' => $lead->contact?->email,
            'status' => ($data['send'] ?? false) ? 'sent' : ($data['status'] ?? 'draft'),
            'sent_at' => ($data['send'] ?? false) ? now() : null,
        ]);

        if ($data['send'] ?? false) {
            $this->sendEmail($email);
            $email->update(['status' => 'sent', 'sent_at' => now()]);
            $lead->update(['last_contacted_at' => now(), 'status' => 'active']);
            $lead->activities()->create([
                'user_id' => $lead->user_id,
                'type' => 'email_sent',
                'description' => "Email sent: {$email->subject}",
            ]);
        }

        return response()->json(['email' => $email->load('lead.company', 'template')], 201);
    }

    public function updateStatus(Request $request, Email $email): JsonResponse
    {
        abort_unless($email->user_id === $request->user()->id, 403, 'Not authorized');

        $status = $request->validate(['status' => ['required', 'in:' . implode(',', Email::STATUSES)]])['status'];

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

    private function sendEmail(Email $email): void
    {
        try {
            Mail::raw($email->body, function ($message) use ($email) {
                $message->to($email->to_email)
                    ->subject($email->subject);
            });
        } catch (\Throwable $e) {
            // Mail delivery is best-effort in dev (log driver)
            logger()->warning("Email delivery failed: {$e->getMessage()}");
        }
    }
}