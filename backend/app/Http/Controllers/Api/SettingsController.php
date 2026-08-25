<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public const KEYS = [
        'sender_name',
        'company_name',
        'from_email',
        'reply_forward_to',
        'reply_receiving_domain',
    ];

    public function index(Request $request): JsonResponse
    {
        $settings = Setting::mapForUser($request->user()->id);

        return response()->json([
            'settings' => [
                'sender_name' => $settings['sender_name'] ?? $request->user()->name ?? '',
                'company_name' => $settings['company_name'] ?? '',
                'from_email' => $settings['from_email'] ?? config('mail.from.address'),
                'reply_forward_to' => $settings['reply_forward_to'] ?? '',
                'reply_receiving_domain' => $settings['reply_receiving_domain']
                    ?? config('services.resend.receiving_domain')
                    ?? 'replies.tyrosoft.com',
            ],
            'defaults' => [
                'from_email' => config('mail.from.address'),
                'from_name' => config('mail.from.name'),
                'reply_receiving_domain' => config('services.resend.receiving_domain', 'replies.tyrosoft.com'),
            ],
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.sender_name' => ['nullable', 'string', 'max:120'],
            'settings.company_name' => ['nullable', 'string', 'max:120'],
            'settings.from_email' => ['nullable', 'email', 'max:255'],
            'settings.reply_forward_to' => ['nullable', 'email', 'max:255'],
            'settings.reply_receiving_domain' => ['nullable', 'string', 'max:255', 'regex:/^[a-z0-9.-]+\.[a-z]{2,}$/i'],
        ]);

        foreach ($data['settings'] as $key => $value) {
            if (! in_array($key, self::KEYS, true)) {
                continue;
            }
            Setting::putValue($request->user()->id, $key, $value === null || $value === '' ? null : $value);
        }

        return response()->json([
            'message' => 'Settings updated',
            'settings' => Setting::mapForUser($request->user()->id),
        ]);
    }
}
