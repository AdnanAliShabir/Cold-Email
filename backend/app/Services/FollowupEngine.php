<?php

namespace App\Services;

use App\Models\Followup;
use App\Models\Lead;
use Carbon\Carbon;

class FollowupEngine
{
    public const SEQUENCE = [
        1 => 4,    // Day 0 + 4 = Follow-up 1
        2 => 9,    // Follow-up 2
        3 => 16,   // Final follow-up
    ];

    public function generateForLead(Lead $lead, ?Carbon $start = null): void
    {
        $base = $start ?? now();

        foreach (self::SEQUENCE as $number => $days) {
            Followup::updateOrCreate(
                ['lead_id' => $lead->id, 'sequence_number' => $number],
                [
                    'user_id' => $lead->user_id,
                    'due_date' => $base->copy()->addDays($days)->toDateString(),
                    'is_completed' => false,
                ]
            );
        }
    }

    public function dueFollowups(int $userId): array
    {
        $today = now()->toDateString();

        $due = Followup::with('lead.company', 'lead.contact')
            ->where('user_id', $userId)
            ->where('is_completed', false)
            ->where('due_date', '<=', $today)
            ->orderBy('due_date')
            ->get();

        return $due->map(function ($f) {
            return [
                'id' => $f->id,
                'sequence_number' => $f->sequence_number,
                'due_date' => $f->due_date,
                'overdue_days' => max(0, now()->startOfDay()->diffInDays(Carbon::parse($f->due_date))),
                'lead_id' => $f->lead_id,
                'lead' => $f->lead ? [
                    'id' => $f->lead->id,
                    'company' => $f->lead->company?->name,
                    'contact' => $f->lead->contact?->name,
                    'stage' => $f->lead->stage,
                ] : null,
            ];
        })->all();
    }

    public function upcomingFollowups(int $userId, int $days = 7): array
    {
        $start = now()->addDay()->toDateString();
        $end = now()->addDays($days)->toDateString();

        return Followup::with('lead.company', 'lead.contact')
            ->where('user_id', $userId)
            ->where('is_completed', false)
            ->whereBetween('due_date', [$start, $end])
            ->orderBy('due_date')
            ->get()
            ->map(fn ($f) => [
                'id' => $f->id,
                'sequence_number' => $f->sequence_number,
                'due_date' => $f->due_date,
                'lead_id' => $f->lead_id,
                'lead' => $f->lead ? [
                    'id' => $f->lead->id,
                    'company' => $f->lead->company?->name,
                    'contact' => $f->lead->contact?->name,
                ] : null,
            ])
            ->all();
    }

    public function complete(Followup $followup): void
    {
        $followup->update([
            'is_completed' => true,
            'completed_at' => now(),
        ]);

        $followup->lead?->update(['last_contacted_at' => now()]);
    }
}