<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Followup;
use App\Services\FollowupEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FollowupController extends Controller
{
    public function __construct(private FollowupEngine $engine)
    {
    }

    public function due(Request $request): JsonResponse
    {
        return response()->json(['followups' => $this->engine->dueFollowups($request->user()->id)]);
    }

    public function upcoming(Request $request): JsonResponse
    {
        return response()->json(['followups' => $this->engine->upcomingFollowups($request->user()->id, $request->integer('days', 7))]);
    }

    public function index(Request $request): JsonResponse
    {
        $followups = Followup::with('lead.company', 'lead.contact')
            ->where('user_id', $request->user()->id)
            ->when($request->boolean('pending'), fn ($q) => $q->where('is_completed', false))
            ->orderByDesc('due_date')
            ->paginate($request->integer('per_page', 25));

        return response()->json($followups);
    }

    public function complete(Request $request, Followup $followup): JsonResponse
    {
        abort_unless($followup->user_id === $request->user()->id, 403, 'Not authorized');

        $this->engine->complete($followup);

        return response()->json(['message' => 'Follow-up completed', 'followup' => $followup->fresh()]);
    }
}