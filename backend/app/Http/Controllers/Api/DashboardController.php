<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Email;
use App\Models\Followup;
use App\Models\Lead;
use App\Models\Meeting;
use App\Models\Proposal;
use App\Services\FollowupEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(private FollowupEngine $followupEngine)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $data = [
            'kpis' => $this->kpis($userId),
            'funnel' => $this->funnel($userId),
            'pipeline' => $this->pipeline($userId),
            'followups_due_today' => $this->followupEngine->dueFollowups($userId),
            'recent_activities' => $this->recentActivities($userId),
            'recent_replies' => $this->recentReplies($userId),
            'upcoming_meetings' => $this->upcomingMeetings($userId),
            'email_performance' => $this->emailPerformance($userId),
            'revenue_by_month' => $this->revenueByMonth($userId),
        ];

        return response()->json($data);
    }

    private function kpis(int $userId): array
    {
        $dueToday = Followup::where('user_id', $userId)->where('is_completed', false)
            ->where('due_date', '<=', now()->toDateString())->count();
        $replies = Email::where('user_id', $userId)->where('status', 'replied')->count();
        $meetings = Meeting::where('user_id', $userId)->where('status', 'scheduled')->count();
        $wins = Lead::where('user_id', $userId)->where('stage', 'won')->count();
        $revenue = Lead::where('user_id', $userId)->where('stage', 'won')->sum('estimated_budget');

        $total = Lead::where('user_id', $userId)->count();
        $new = Lead::where('user_id', $userId)->where('stage', 'new_lead')->count();

        return [
            'total_leads' => $total,
            'new_leads' => $new,
            'followups_due_today' => $dueToday,
            'replies' => $replies,
            'meetings_scheduled' => $meetings,
            'won_deals' => $wins,
            'revenue' => $revenue,
            'pipeline_value' => (float) Lead::where('user_id', $userId)
                ->whereIn('stage', ['contacted', 'followup_1', 'followup_2', 'meeting', 'proposal_sent', 'negotiation'])
                ->sum('estimated_budget'),
        ];
    }

    private function funnel(int $userId): array
    {
        $stages = Lead::STAGES;
        $counts = Lead::selectRaw('stage, count(*) as total')
            ->where('user_id', $userId)
            ->groupBy('stage')
            ->pluck('total', 'stage');

        return collect($stages)->map(fn ($stage) => [
            'stage' => $stage,
            'label' => Lead::stageLabel($stage),
            'count' => (int) ($counts[$stage] ?? 0),
        ])->values()->all();
    }

    private function pipeline(int $userId): \Illuminate\Support\Collection
    {
        return \App\Models\Lead::where('user_id', $userId)
            ->whereIn('stage', ['contacted', 'followup_1', 'followup_2', 'meeting', 'proposal_sent', 'negotiation'])
            ->with('company', 'contact')
            ->orderByRaw("case stage when 'contacted' then 1 when 'followup_1' then 2 when 'followup_2' then 3 when 'meeting' then 4 when 'proposal_sent' then 5 when 'negotiation' then 6 end")
            ->get()
            ->map(fn ($lead) => [
                'id' => $lead->id,
                'stage' => $lead->stage,
                'company' => $lead->company?->name,
                'contact' => $lead->contact?->name,
                'estimated_budget' => $lead->estimated_budget,
            ])
            ->groupBy('stage');
    }

    private function recentActivities(int $userId, int $limit = 10): array
    {
        return \App\Models\Activity::with('lead.company')
            ->where('user_id', $userId)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id,
                'type' => $a->type,
                'description' => $a->description,
                'lead' => $a->lead?->company?->name,
                'created_at' => $a->created_at?->toIso8601String(),
            ])
            ->all();
    }

    private function recentReplies(int $userId, int $limit = 10): array
    {
        return Email::with('lead.company', 'lead.contact')
            ->where('user_id', $userId)
            ->where('direction', 'inbound')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(fn ($email) => [
                'id' => $email->id,
                'subject' => $email->subject,
                'company' => $email->lead?->company?->name,
                'contact' => $email->lead?->contact?->name,
                'body' => mb_strimwidth($email->body, 0, 120, '...'),
                'created_at' => $email->created_at?->toIso8601String(),
            ])
            ->all();
    }

    private function upcomingMeetings(int $userId, int $limit = 10): array
    {
        return Meeting::with('lead.company', 'lead.contact')
            ->where('user_id', $userId)
            ->where('status', 'scheduled')
            ->where('starts_at', '>=', now())
            ->orderBy('starts_at')
            ->limit($limit)
            ->get()
            ->map(fn ($m) => [
                'id' => $m->id,
                'title' => $m->title,
                'starts_at' => $m->starts_at?->toIso8601String(),
                'company' => $m->lead?->company?->name,
                'contact' => $m->lead?->contact?->name,
            ])
            ->all();
    }

    private function emailPerformance(int $userId): array
    {
        $total = Email::where('user_id', $userId)->where('direction', 'outbound')->count();
        $sent = Email::where('user_id', $userId)->whereIn('status', ['sent', 'opened', 'clicked', 'replied'])->count();
        $opened = Email::where('user_id', $userId)->whereIn('status', ['opened', 'clicked', 'replied'])->count();
        $replied = Email::where('user_id', $userId)->where('status', 'replied')->count();

        return [
            'total' => $total,
            'open_rate' => $sent > 0 ? round($opened / $sent * 100, 1) : 0,
            'reply_rate' => $sent > 0 ? round($replied / $sent * 100, 1) : 0,
        ];
    }

    private function revenueByMonth(int $userId, int $months = 6): array
    {
        $wins = Lead::where('user_id', $userId)->where('stage', 'won')->get(['estimated_budget', 'updated_at']);

        $series = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $month = now()->startOfMonth()->subMonths($i);
            $label = $month->format('M Y');
            $series[] = [
                'month' => $label,
                'revenue' => (float) $wins->filter(fn ($l) => $l->updated_at && $l->updated_at->between(
                    $month->copy()->startOfMonth(), $month->copy()->endOfMonth()
                ))->sum('estimated_budget'),
            ];
        }

        return $series;
    }
}