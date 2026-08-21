<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Note;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NoteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notes = Note::with('lead.company')
            ->where('user_id', $request->user()->id)
            ->when($request->filled('lead_id'), fn ($q) => $q->where('lead_id', $request->query('lead_id')))
            ->orderByDesc('created_at')
            ->get();

        return response()->json(['notes' => $notes]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_id' => ['nullable', 'exists:leads,id'],
            'content' => ['required', 'string'],
        ]);

        $note = Note::create(array_merge($data, ['user_id' => $request->user()->id]));

        $note->lead?->activities()->create([
            'user_id' => $request->user()->id,
            'type' => 'note_added',
            'description' => 'Note added',
        ]);

        return response()->json(['note' => $note], 201);
    }

    public function destroy(Request $request, Note $note): JsonResponse
    {
        abort_unless($note->user_id === $request->user()->id, 403, 'Not authorized');
        $note->delete();

        return response()->json(['message' => 'Note deleted']);
    }
}