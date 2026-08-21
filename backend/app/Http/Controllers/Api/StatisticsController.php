<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Email;
use App\Models\Lead;
use App\Models\Meeting;
use App\Models\Proposal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StatisticsController extends Controller
{
    public function overview(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $totalLeads = Lead::where('user_id', $userId)->count();
        $emailsSent = Email::where('user_id', $userId)->whereIn('status', ['sent', 'opened', 'clicked', 'replied'])->count();
        $emailsOpened = Email::where('user_id', $userId)->whereIn('status', ['opened', 'clicked', 'replied'])->count();
        $replies = Email::where('user_id', $userId)->where('status', 'replied')->count();
        $meetings = Meeting::where('user_id', $userId)->count();
        $proposals = Proposal::whereHas('lead', fn ($q) => $q->where('user_id', $userId))->count();

        $wins = Lead::where('user_id', $userId)->where('stage', 'won')->count();
        $losses = Lead::where('user_id', $userId)->where('stage', 'lost')->count();
        $closed = $wins + $losses;
        $winRate = $closed > 0 ? round($wins / $closed * 100, 1) : 0;

        $avgDeal = $wins > 0 ? round(Lead::where('user_id', $userId)->where('stage', 'won')->avg('estimated_budget'), 2) : 0;
        $revenue = Lead::where('user_id', $userId)->where('stage', 'won')->sum('estimated_budget');

        return response()->json([
            'metrics' => [
                'total_leads' => $totalLeads,
                'emails_sent' => $emailsSent,
                'open_rate' => $emailsSent > 0 ? round($emailsOpened / $emailsSent * 100, 1) : 0,
                'reply_rate' => $emailsSent > 0 ? round($replies / $emailsSent * 100, 1) : 0,
                'meetings' => $meetings,
                'proposals' => $proposals,
                'wins' => $wins,
                'losses' => $losses,
                'win_rate' => $winRate,
                'average_deal_size' => $avgDeal,
                'revenue' => $revenue,
            ],
            'monthly_revenue' => $this->monthlyRevenue($userId),
            'pipeline' => $this->pipelineBreakdown($userId),
            'lead_source' => $this->leadSource($userId),
            'industry_performance' => $this->industryPerformance($userId),
        ]);
    }

    private function monthlyRevenue(int $userId, int $months = 12): array
    {
        $wins = Lead::where('user_id', $userId)->where('stage', 'won')->get(['estimated_budget', 'updated_at']);

        $series = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $month = now()->startOfMonth()->subMonths($i);
            $series[] = [
                'month' => $month->format('M Y'),
                'revenue' => (float) $wins->filter(fn ($l) => $l->updated_at && $l->updated_at->between(
                    $month->copy()->startOfMonth(), $month->copy()->endOfMonth()
                ))->sum('estimated_budget'),
            ];
        }

        return $series;
    }

    private function pipelineBreakdown(int $userId): array
    {
        $stages = Lead::STAGES;
        $counts = Lead::selectRaw('stage, count(*) as total, coalesce(sum(estimated_budget),0) as value')
            ->where('user_id', $userId)
            ->groupBy('stage')
            ->pluck('value', 'stage');

        return collect($stages)->map(fn ($stage) => [
            'stage' => $stage,
            'label' => Lead::stageLabel($stage),
            'value' => (float) ($counts[$stage] ?? 0),
        ])->values()->all();
    }

    private function leadSource(int $userId): array
    {
        return Lead::where('user_id', $userId)
            ->selectRaw('coalesce(source, \'unknown\') as source, count(*) as count')
            ->groupBy('source')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => ['source' => $row->source, 'count' => $row->count])
            ->values()
            ->all();
    }

    private function industryPerformance(int $userId): array
    {
        return Lead::join('companies', 'companies.id', '=', 'leads.company_id')
            ->where('companies.user_id', $userId)
            ->selectRaw('coalesce(companies.industry, \'Unknown\') as industry, count(*) as leads, count(*) filter (where leads.stage = \'won\') as wins')
            ->groupBy('companies.industry')
            ->orderByDesc('leads')
            ->get()
            ->map(fn ($row) => [
                'industry' => $row->industry,
                'leads' => $row->leads,
                'wins' => $row->wins,
            ])
            ->values()
            ->all();
    }
}