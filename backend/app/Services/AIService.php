<?php

namespace App\Services;

use App\Models\Lead;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class AIService
{
    private bool $enabled;

    public function __construct()
    {
        $this->enabled = (bool) config('services.openai.key');
    }

    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    private function chat(string $system, string $userPrompt): ?string
    {
        if (! $this->enabled) {
            return null;
        }

        try {
            $response = Http::withToken(config('services.openai.key'))
                ->timeout(60)
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => config('services.openai.model', 'gpt-4o-mini'),
                    'messages' => [
                        ['role' => 'system', 'content' => $system],
                        ['role' => 'user', 'content' => $userPrompt],
                    ],
                    'temperature' => 0.7,
                ]);

            if ($response->successful()) {
                return $response->json('choices.0.message.content');
            }

            logger()->warning('OpenAI request failed', ['status' => $response->status(), 'body' => $response->body()]);
        } catch (\Throwable $e) {
            logger()->warning('OpenAI request error', ['error' => $e->getMessage()]);
        }

        return null;
    }

    public function analyzeReviews(string $platform, string $appName): array
    {
        $openAi = $this->chat(
            'You are an expert mobile app review analyst. Analyze review sentiment and extract actionable insights. Respond as valid JSON with keys: common_complaints (array of strings), sentiment (string), opportunities (array of strings).',
            "Analyze reviews for the {$platform} app \"{$appName}\"."
        );

        if ($openAi) {
            try {
                return json_decode($openAi, true) ?? $this->fallbackReviewAnalysis();
            } catch (\Throwable $e) {
                // fall through to fallback
            }
        }

        return $this->fallbackReviewAnalysis();
    }

    private function fallbackReviewAnalysis(): array
    {
        return [
            'common_complaints' => [
                'App crashes on launch for a portion of users',
                'Slow loading times on older devices',
                'Unclear onboarding flow causing early drop-off',
                'Push notifications arrive at inconvenient times',
            ],
            'sentiment' => 'Mixed — the app has decent ratings but recurring technical complaints about stability and performance are limiting its rating.',
            'opportunities' => [
                'Fix the startup crash to immediately improve the rating',
                'Optimize performance for older devices',
                'Rework onboarding with progress indicators',
                'Add a subscription upsell with a clear value prop',
            ],
        ];
    }

    public function generateAudit(Lead $lead): array
    {
        $appName = $lead->app?->name ?? $lead->company?->name ?? 'the app';
        $rating = $lead->app?->rating ?? null;
        $downloads = $lead->app?->android_downloads ?? null;
        $version = $lead->app?->current_version ?? null;

        $context = "App: {$appName}. Rating: {$rating}/5. Android downloads: {$downloads}. Version: {$version}.";

        $openAi = $this->chat(
            'You are an expert mobile app auditor. Generate an audit with findings for a mobile app. Respond as valid JSON: an object with key "findings", an array of objects each with: category (ui_ux|performance|store|revenue), title (string), description (string), severity (critical|high|medium|low), ai_recommendation (string). Generate 6-8 findings.',
            "Audit the following mobile app: {$context}"
        );

        if ($openAi) {
            try {
                $parsed = json_decode($openAi, true);
                if (isset($parsed['findings'])) {
                    return $parsed;
                }
            } catch (\Throwable $e) {
                // fall through
            }
        }

        return [
            'findings' => [
                $this->finding('performance', 'Slow cold start time', 'App takes over 3 seconds to reach the first screen on mid-range devices.', 'high', 'Profile startup with a tracing tool and defer non-critical work off the main thread.'),
                $this->finding('ui_ux', 'Onboarding friction', 'Multiple required steps before reaching the core value; no skip option.', 'high', 'Cut onboarding to one screen with a skip option and progressive disclosure.'),
                $this->finding('performance', 'Memory pressure on list screens', 'Image-heavy list screens cause jank and background crashes.', 'medium', 'Adopt image downsampling, lazy loading and a disk cache.'),
                $this->finding('store', 'Weak keyword coverage', 'App title and description do not include high-volume category keywords.', 'medium', 'Rewrite the short description around primary search terms.'),
                $this->finding('revenue', 'Missing subscription trial', 'No free trial or paywall nudges in the user journey.', 'high', 'Add a 7-day free trial with an onboarding push nudge.'),
                $this->finding('ui_ux', 'No dark mode support', 'App lacks dark mode, hurting retention for evening usage.', 'low', 'Add a dark theme following the platform design guidelines.'),
                $this->finding('revenue', 'No referral program', 'No incentive for existing users to refer new users.', 'low', 'Implement a referral flow rewarding both parties.'),
                $this->finding('store', 'Outdated screenshots', 'Store screenshots do not reflect the current UI.', 'medium', 'Refresh screenshots and add a video preview.'),
            ],
        ];
    }

    private function finding(string $category, string $title, string $description, string $severity, string $recommendation): array
    {
        return [
            'category' => $category,
            'title' => $title,
            'description' => $description,
            'severity' => $severity,
            'ai_recommendation' => $recommendation,
        ];
    }

    public function generateOutreach(Lead $lead, string $type = 'cold'): array
    {
        $company = $lead->company?->name ?? 'your company';
        $contact = $lead->contact?->name ?? 'there';
        $position = $lead->contact?->position ?? '';
        $appName = $lead->app?->name ?? 'your app';

        $context = "Company: {$company}. Contact: {$contact}, {$position}. App: {$appName}.";

        $system = match ($type) {
            'followup' => 'You are an expert sales email writer. Write a short follow-up email (max 120 words). Return JSON with keys: subject (string), body (string).',
            'linkedin' => 'You are an expert sales professional. Write a short LinkedIn connection message (max 80 words). Return JSON with keys: subject (string), body (string).',
            'meeting' => 'You are an expert sales email writer. Write a short meeting request email (max 100 words). Return JSON with keys: subject (string), body (string).',
            default => 'You are an expert cold email writer for a mobile app development agency. Write a personalized cold email (max 150 words). Return JSON with keys: subject (string), body (string).',
        };

        $openAi = $this->chat($system, "Write outreach for: {$context}");

        if ($openAi) {
            try {
                $parsed = json_decode($openAi, true);
                if (isset($parsed['subject']) && isset($parsed['body'])) {
                    return $parsed;
                }
            } catch (\Throwable $e) {
                // fall through
            }
        }

        return $this->fallbackOutreach($lead, $type);
    }

    private function fallbackOutreach(Lead $lead, string $type): array
    {
        $company = $lead->company?->name ?? 'your company';
        $contact = $lead->contact?->name ?? 'there';
        $position = $lead->contact?->position ?? '';
        $appName = $lead->app?->name ?? 'your app';

        return match ($type) {
            'followup' => [
                'subject' => "Re: {$appName}",
                'body' => "Hi {$contact},\n\nI wanted to follow up on my earlier note about {$appName}. I know things get busy, but I'd love to share a quick audit that highlights a few quick wins for the app.\n\nWould 15 minutes next week work?\n\nBest,\n[Your Name]",
            ],
            'linkedin' => [
                'subject' => 'Quick note',
                'body' => "Hi {$contact},\n\nI came across {$appName} and was impressed by the traction. I help app teams like yours unlock faster growth. Would you be open to a quick chat?\n\nBest,\n[Your Name]",
            ],
            'meeting' => [
                'subject' => "Meeting request: {$appName} audit",
                'body' => "Hi {$contact},\n\nI've put together a free, 15-minute audit of {$appName}. Would you be open to a quick call this week or next to review the findings?\n\nBest,\n[Your Name]",
            ],
            default => [
                'subject' => "A quick idea for {$appName}",
                'body' => "Hi {$contact},\n\nI hope this finds you well. My name is [Your Name] from [Your Agency]. I've been following {$appName} and noticed a few opportunities to improve user retention and monetization.\n\nI've prepared a short, actionable audit specific to {$appName} that I'd love to walk you through.\n\nWould you be open to a 15-minute call this week?\n\nBest,\n[Your Name]",
            ],
        };
    }

    public function scoreLead(Lead $lead): array
    {
        $score = 50;

        if ($lead->app) {
            $app = $lead->app;
            if ($app->rating !== null) {
                $score += max(-15, min(15, ($app->rating - 3) * 5));
            }
            if ($app->android_downloads > 100000) {
                $score += 10;
            } elseif ($app->android_downloads > 10000) {
                $score += 5;
            }
            if ($app->review_count > 1000) {
                $score += 5;
            }
            if ($app->last_updated && $app->last_updated->gt(now()->subMonths(3))) {
                $score += 5;
            } else {
                $score -= 5;
            }
        }

        if ($lead->company?->industry) {
            $score += 3;
        }
        if ($lead->company?->size === '51-200' || $lead->company?->size === '201-500' || $lead->company?->size === '500+') {
            $score += 5;
        }

        if ($lead->contact?->email) {
            $score += 5;
        }

        $score = max(0, min(100, (int) round($score)));

        return [
            'score' => $score,
            'band' => $score >= 70 ? 'hot' : ($score >= 40 ? 'warm' : 'cold'),
        ];
    }
}