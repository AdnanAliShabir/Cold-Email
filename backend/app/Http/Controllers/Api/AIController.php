<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Audit;
use App\Models\Lead;
use App\Services\AIService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AIController extends Controller
{
    public function __construct(private AIService $ai)
    {
    }

    public function reviewAnalysis(Request $request): JsonResponse
    {
        $data = $request->validate([
            'platform' => ['required', 'in:google_play,app_store'],
            'app_name' => ['sometimes', 'string', 'max:255'],
            'lead_id' => ['sometimes', 'exists:leads,id'],
        ]);

        $appName = $data['app_name'] ?? null;
        if (! $appName && isset($data['lead_id'])) {
            $lead = Lead::find($data['lead_id']);
            $appName = $lead?->app?->name ?: $lead?->company?->name;
        }
        $appName = $appName ?: 'the app';

        return response()->json([
            'analysis' => $this->ai->analyzeReviews($data['platform'], $appName),
            'ai_enabled' => $this->ai->isEnabled(),
        ]);
    }

    public function auditGenerator(Request $request): JsonResponse
    {
        $data = $request->validate(['lead_id' => ['required', 'exists:leads,id']]);

        $lead = Lead::with('company', 'app')->findOrFail($data['lead_id']);
        abort_unless($lead->user_id === $request->user()->id, 403, 'Not authorized');

        $result = $this->ai->generateAudit($lead);

        $audit = $lead->audits()->create(['summary' => 'AI-generated audit', 'completed_at' => now()]);
        foreach ($result['findings'] as $finding) {
            $audit->items()->create([
                'category' => $finding['category'],
                'title' => $finding['title'],
                'description' => $finding['description'] ?? null,
                'severity' => $finding['severity'],
                'ai_recommendation' => $finding['ai_recommendation'] ?? null,
            ]);
        }
        $audit->refreshCounts();

        return response()->json([
            'audit' => $audit->load('items'),
            'ai_enabled' => $this->ai->isEnabled(),
        ], 201);
    }

    public function outreach(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_id' => ['required', 'exists:leads,id'],
            'type' => ['required', 'in:cold,followup,linkedin,meeting'],
        ]);

        $lead = Lead::with('company', 'contact', 'app')->findOrFail($data['lead_id']);
        abort_unless($lead->user_id === $request->user()->id, 403, 'Not authorized');

        return response()->json([
            'draft' => $this->ai->generateOutreach($lead, $data['type']),
            'ai_enabled' => $this->ai->isEnabled(),
        ]);
    }

    public function leadScore(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->user_id === $request->user()->id, 403, 'Not authorized');

        $result = $this->ai->scoreLead($lead);
        $lead->update(['lead_score' => $result['score']]);

        return response()->json(['lead_score' => $result, 'lead' => $lead->fresh(['company', 'app', 'contact'])]);
    }
}