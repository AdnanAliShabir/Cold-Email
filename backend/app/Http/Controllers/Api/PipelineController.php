<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\FollowupEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PipelineController extends Controller
{
    public function __construct(private FollowupEngine $followupEngine)
    {
    }
    public function board(Request $request): JsonResponse
    {
        $stages = Lead::STAGES;

        $leadsByStage = Lead::with(['company', 'contact', 'app'])
            ->where('user_id', $request->user()->id)
            ->orderByRaw('case when stage = \'won\' then 1 when stage = \'lost\' then 2 else 0 end, updated_at desc')
            ->get()
            ->groupBy('stage');

        $board = collect($stages)->mapWithKeys(function ($stage) use ($leadsByStage) {
            return [
                $stage => [
                    'key' => $stage,
                    'label' => Lead::stageLabel($stage),
                    'leads' => collect($leadsByStage->get($stage, collect()))->map(fn ($l) => $this->transform($l)),
                ],
            ];
        });

        return response()->json(['pipeline' => $board]);
    }

    public function updateStage(Request $request, Lead $lead): JsonResponse
    {
        $request->validate(['stage' => ['required', 'in:' . implode(',', Lead::STAGES)]]);

        abort_unless($lead->user_id === $request->user()->id, 403, 'Not authorized');

        $oldStage = $lead->stage;
        $newStage = $request->stage;

        $lead->update(['stage' => $newStage]);

        if ($newStage === 'won') {
            $lead->update(['status' => 'won']);
        } elseif ($newStage === 'lost') {
            $lead->update(['status' => 'lost']);
        } elseif (in_array($newStage, ['contacted', 'followup_1', 'followup_2', 'meeting', 'proposal_sent', 'negotiation'])) {
            $lead->update(['status' => 'active']);
        }

        $lead->statusHistory()->create([
            'stage' => $newStage,
            'status' => $lead->status,
            'changed_at' => now(),
        ]);

        if ($newStage === 'contacted') {
            $this->followupEngine->generateForLead($lead, now());
        }

        $lead->activities()->create([
            'user_id' => $lead->user_id,
            'type' => 'stage_changed',
            'description' => "Moved from {$newStage} to {$newStage}",
            'metadata' => ['from' => $oldStage, 'to' => $newStage],
        ]);

        return response()->json(['lead' => $lead->fresh(['company', 'contact', 'app'])]);
    }

    private function transform(Lead $lead): array
    {
        return [
            'id' => $lead->id,
            'stage' => $lead->stage,
            'status' => $lead->status,
            'priority' => $lead->priority,
            'lead_score' => $lead->lead_score,
            'estimated_budget' => $lead->estimated_budget,
            'company' => $lead->company,
            'contact' => $lead->contact,
            'app' => $lead->app,
            'updated_at' => $lead->updated_at?->toIso8601String(),
        ];
    }
}