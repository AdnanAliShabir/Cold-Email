<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmailTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailTemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $templates = EmailTemplate::where('user_id', $request->user()->id)
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->query('type')))
            ->orderBy('name')
            ->get();

        return response()->json(['templates' => $templates]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $template = EmailTemplate::create(array_merge($data, ['user_id' => $request->user()->id]));

        return response()->json(['template' => $template], 201);
    }

    public function update(Request $request, EmailTemplate $template): JsonResponse
    {
        abort_unless($template->user_id === $request->user()->id, 403, 'Not authorized');
        $template->update($this->validated($request));

        return response()->json(['template' => $template->fresh()]);
    }

    public function destroy(Request $request, EmailTemplate $template): JsonResponse
    {
        abort_unless($template->user_id === $request->user()->id, 403, 'Not authorized');
        $template->delete();

        return response()->json(['message' => 'Template deleted']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'in:' . implode(',', EmailTemplate::TYPES)],
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string'],
            'is_default' => ['sometimes', 'boolean'],
        ]);
    }
}