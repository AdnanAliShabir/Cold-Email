<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Audit;
use App\Models\AuditItem;
use App\Models\Lead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $audits = Audit::with('lead.company', 'items')
            ->whereHas('lead', fn ($q) => $q->where('user_id', $request->user()->id))
            ->withCount('items')
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json($audits);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_id' => ['required', 'exists:leads,id'],
            'summary' => ['nullable', 'string'],
            'item' => ['sometimes', 'array'],
            'item.category' => ['required_with:item', 'in:' . implode(',', AuditItem::CATEGORIES)],
            'item.title' => ['required_with:item', 'string', 'max:255'],
            'item.description' => ['nullable', 'string'],
            'item.severity' => ['required_with:item', 'in:' . implode(',', AuditItem::SEVERITIES)],
            'item.ai_recommendation' => ['nullable', 'string'],
        ]);

        $lead = Lead::findOrFail($data['lead_id']);
        abort_unless($lead->user_id === $request->user()->id, 403, 'Not authorized');

        $audit = $lead->audits()->create([
            'summary' => $data['summary'] ?? null,
            'completed_at' => now(),
        ]);

        if (isset($data['item'])) {
            $audit->items()->create($data['item']);
            $audit->refreshCounts();
        }

        return response()->json(['audit' => $audit->load('items')], 201);
    }

    public function show(Request $request, Audit $audit): JsonResponse
    {
        abort_unless($audit->lead->user_id === $request->user()->id, 403, 'Not authorized');

        return response()->json(['audit' => $audit->load('items', 'lead.company', 'lead.app')]);
    }

    public function addItem(Request $request, Audit $audit): JsonResponse
    {
        abort_unless($audit->lead->user_id === $request->user()->id, 403, 'Not authorized');

        $data = $request->validate([
            'category' => ['required', 'in:' . implode(',', AuditItem::CATEGORIES)],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'severity' => ['required', 'in:' . implode(',', AuditItem::SEVERITIES)],
            'notes' => ['nullable', 'string'],
            'ai_recommendation' => ['nullable', 'string'],
        ]);

        $item = $audit->items()->create($data);
        $audit->refreshCounts();

        return response()->json(['item' => $item], 201);
    }

    public function updateItem(Request $request, AuditItem $item): JsonResponse
    {
        abort_unless($item->audit->lead->user_id === $request->user()->id, 403, 'Not authorized');

        $item->update($request->validate([
            'category' => ['sometimes', 'in:' . implode(',', AuditItem::CATEGORIES)],
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'severity' => ['sometimes', 'in:' . implode(',', AuditItem::SEVERITIES)],
            'notes' => ['nullable', 'string'],
            'ai_recommendation' => ['nullable', 'string'],
            'screenshot_path' => ['nullable', 'string'],
        ]));

        $item->audit->refreshCounts();

        return response()->json(['item' => $item->fresh()]);
    }

    public function destroy(Request $request, Audit $audit): JsonResponse
    {
        abort_unless($audit->lead->user_id === $request->user()->id, 403, 'Not authorized');
        $audit->delete();

        return response()->json(['message' => 'Audit deleted']);
    }
}