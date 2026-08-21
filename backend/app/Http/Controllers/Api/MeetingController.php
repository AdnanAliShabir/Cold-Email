<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Meeting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeetingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $meetings = Meeting::with('lead.company', 'lead.contact')
            ->where('user_id', $request->user()->id)
            ->orderBy('starts_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json($meetings);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_id' => ['nullable', 'exists:leads,id'],
            'title' => ['required', 'string', 'max:255'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'location' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'in:' . implode(',', Meeting::STATUSES)],
            'notes' => ['nullable', 'string'],
        ]);

        $meeting = Meeting::create(array_merge($data, ['user_id' => $request->user()->id]));

        $meeting->lead?->activities()->create([
            'user_id' => $request->user()->id,
            'type' => 'meeting_scheduled',
            'description' => "Meeting scheduled: {$meeting->title}",
        ]);

        return response()->json(['meeting' => $meeting->load('lead.company', 'lead.contact')], 201);
    }

    public function update(Request $request, Meeting $meeting): JsonResponse
    {
        abort_unless($meeting->user_id === $request->user()->id, 403, 'Not authorized');
        $meeting->update($request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'starts_at' => ['sometimes', 'date'],
            'ends_at' => ['nullable', 'date'],
            'location' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'in:' . implode(',', Meeting::STATUSES)],
            'notes' => ['nullable', 'string'],
        ]));

        return response()->json(['meeting' => $meeting->fresh()]);
    }

    public function destroy(Request $request, Meeting $meeting): JsonResponse
    {
        abort_unless($meeting->user_id === $request->user()->id, 403, 'Not authorized');
        $meeting->delete();

        return response()->json(['message' => 'Meeting deleted']);
    }
}