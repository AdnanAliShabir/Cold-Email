<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $tasks = Task::with('lead.company')
            ->where('user_id', $request->user()->id)
            ->when($request->boolean('pending'), fn ($q) => $q->where('is_completed', false))
            ->orderBy('due_date')
            ->paginate($request->integer('per_page', 25));

        return response()->json($tasks);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lead_id' => ['nullable', 'exists:leads,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'due_date' => ['nullable', 'date'],
        ]);

        $task = Task::create(array_merge($data, ['user_id' => $request->user()->id]));

        return response()->json(['task' => $task], 201);
    }

    public function toggle(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->user_id === $request->user()->id, 403, 'Not authorized');

        $task->update([
            'is_completed' => ! $task->is_completed,
            'completed_at' => $task->is_completed ? now() : null,
        ]);

        return response()->json(['task' => $task->fresh()]);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->user_id === $request->user()->id, 403, 'Not authorized');
        $task->update($request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string'],
            'due_date' => ['sometimes', 'nullable', 'date'],
        ]));

        return response()->json(['task' => $task->fresh()]);
    }

    public function destroy(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->user_id === $request->user()->id, 403, 'Not authorized');
        $task->delete();

        return response()->json(['message' => 'Task deleted']);
    }
}