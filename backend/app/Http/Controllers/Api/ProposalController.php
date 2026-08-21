<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\Proposal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProposalController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $proposals = Proposal::with('lead.company', 'lead.contact')
            ->whereHas('lead', fn ($q) => $q->where('user_id', $request->user()->id))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json($proposals);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_id' => ['required', 'exists:leads,id'],
            'title' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0'],
            'status' => ['sometimes', 'in:' . implode(',', Proposal::STATUSES)],
        ]);

        $lead = Lead::findOrFail($data['lead_id']);
        abort_unless($lead->user_id === $request->user()->id, 403, 'Not authorized');

        $proposal = Proposal::create($data);

        $lead->activities()->create([
            'user_id' => $request->user()->id,
            'type' => 'proposal_sent',
            'description' => "Proposal created: {$proposal->title}",
        ]);

        return response()->json(['proposal' => $proposal->load('lead.company', 'lead.contact')], 201);
    }

    public function update(Request $request, Proposal $proposal): JsonResponse
    {
        abort_unless($proposal->lead->user_id === $request->user()->id, 403, 'Not authorized');
        $proposal->update($request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'amount' => ['sometimes', 'numeric', 'min:0'],
            'status' => ['sometimes', 'in:' . implode(',', Proposal::STATUSES)],
        ]));

        return response()->json(['proposal' => $proposal->fresh()]);
    }

    public function destroy(Request $request, Proposal $proposal): JsonResponse
    {
        abort_unless($proposal->lead->user_id === $request->user()->id, 403, 'Not authorized');
        $proposal->delete();

        return response()->json(['message' => 'Proposal deleted']);
    }
}