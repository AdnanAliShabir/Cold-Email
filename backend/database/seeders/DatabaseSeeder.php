<?php

namespace Database\Seeders;

use App\Models\Activity;
use App\Models\App;
use App\Models\Audit;
use App\Models\AuditItem;
use App\Models\Company;
use App\Models\Contact;
use App\Models\Email;
use App\Models\EmailTemplate;
use App\Models\Followup;
use App\Models\Lead;
use App\Models\Meeting;
use App\Models\Note;
use App\Models\Proposal;
use App\Models\Task;
use App\Models\User;
use App\Services\AIService;
use App\Services\FollowupEngine;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use \Illuminate\Database\Console\Seeds\WithoutModelEvents;

    public function run(): void
    {
        $user = User::updateOrCreate(
            ['email' => 'admin@crm.com'],
            [
                'name' => 'Admin',
                'password' => bcrypt('password'),
                'role' => 'admin',
            ]
        );

        $this->seedEmailTemplates($user);
        $this->seedLeads($user);
    }

    private function seedEmailTemplates(User $user): void
    {
        $templates = [
            ['name' => 'Cold Intro', 'type' => 'cold', 'subject' => 'A quick idea for {{app_name}}', 'body' => "Hi {{contact_name}},\n\nI've been following {{app_name}} and noticed a few opportunities to improve retention and revenue. I'd love to share a short audit with you.\n\nOpen to a 15-minute call?\n\nBest,\n{{your_name}}"],
            ['name' => 'Follow-up 1', 'type' => 'followup', 'subject' => 'Re: {{app_name}}', 'body' => "Hi {{contact_name}},\n\nWanted to make sure you saw my last note about {{app_name}}. Happy to share the audit whenever works for you.\n\nBest,\n{{your_name}}"],
            ['name' => 'LinkedIn Connect', 'type' => 'linkedin', 'subject' => 'Quick note', 'body' => "Hi {{contact_name}},\n\nCame across {{app_name}} — impressive traction. I help app teams grow faster. Open to a quick chat?\n\nBest,\n{{your_name}}"],
            ['name' => 'Meeting Request', 'type' => 'meeting', 'subject' => 'Meeting request: {{app_name}} audit', 'body' => "Hi {{contact_name}},\n\nI've prepared a free 15-minute audit of {{app_name}}. Would you be open to a call this week?\n\nBest,\n{{your_name}}"],
        ];

        foreach ($templates as $t) {
            EmailTemplate::updateOrCreate(
                ['user_id' => $user->id, 'name' => $t['name']],
                $t
            );
        }
    }

    private function seedLeads(User $user): void
    {
        $companies = [
            [
                'name' => 'FitTrack Inc', 'website' => 'fittrack.com', 'industry' => 'Health & Fitness',
                'country' => 'US', 'size' => '51-200', 'revenue' => 1200000,
                'contact' => ['name' => 'Sarah Johnson', 'position' => 'Product Manager', 'email' => 'sarah@fittrack.com'],
                'app' => ['name' => 'FitTrack', 'android_downloads' => 250000, 'rating' => 4.2, 'review_count' => 1800, 'current_version' => '3.1.4'],
                'stage' => 'contacted', 'source' => 'Play Store Search', 'priority' => 'high', 'budget' => 25000,
            ],
            [
                'name' => 'MediLog Health', 'website' => 'medilog.health', 'industry' => 'Healthcare',
                'country' => 'DE', 'size' => '11-50', 'revenue' => 800000,
                'contact' => ['name' => 'Lukas Weber', 'position' => 'CEO', 'email' => 'lukas@medilog.health'],
                'app' => ['name' => 'MediLog', 'android_downloads' => 150000, 'rating' => 3.8, 'review_count' => 950, 'current_version' => '2.4.0'],
                'stage' => 'researching', 'source' => 'App Store Search', 'priority' => 'medium', 'budget' => 15000,
            ],
            [
                'name' => 'Budgetly', 'website' => 'budgetly.app', 'industry' => 'Finance',
                'country' => 'GB', 'size' => '1-10', 'revenue' => 300000,
                'contact' => ['name' => 'Emma Clarke', 'position' => 'Founder', 'email' => 'emma@budgetly.app'],
                'app' => ['name' => 'Budgetly', 'android_downloads' => 450000, 'rating' => 4.5, 'review_count' => 3200, 'current_version' => '5.0.2'],
                'stage' => 'followup_2', 'source' => 'Website Discovery', 'priority' => 'high', 'budget' => 30000,
            ],
            [
                'name' => 'LearnLingo', 'website' => 'learnlingo.com', 'industry' => 'Education',
                'country' => 'ES', 'size' => '11-50', 'revenue' => 500000,
                'contact' => ['name' => 'Carlos Ruiz', 'position' => 'Marketing Lead', 'email' => 'carlos@learnlingo.com'],
                'app' => ['name' => 'LearnLingo', 'android_downloads' => 90000, 'rating' => 4.0, 'review_count' => 1200, 'current_version' => '2.1.8'],
                'stage' => 'meeting', 'source' => 'LinkedIn', 'priority' => 'medium', 'budget' => 20000,
            ],
            [
                'name' => 'QuickDesk', 'website' => 'quickdesk.io', 'industry' => 'Productivity',
                'country' => 'US', 'size' => '201-500', 'revenue' => 5000000,
                'contact' => ['name' => 'Mike Chen', 'position' => 'VP Engineering', 'email' => 'mike@quickdesk.io'],
                'app' => ['name' => 'QuickDesk', 'android_downloads' => 1200000, 'rating' => 4.7, 'review_count' => 8500, 'current_version' => '4.3.1'],
                'stage' => 'proposal_sent', 'source' => 'Referral', 'priority' => 'high', 'budget' => 45000,
            ],
            [
                'name' => 'PhotoPix', 'website' => 'photopix.app', 'industry' => 'Photography',
                'country' => 'IN', 'size' => '1-10', 'revenue' => 150000,
                'contact' => ['name' => 'Ananya Rao', 'position' => 'Founder', 'email' => 'ananya@photopix.app'],
                'app' => ['name' => 'PhotoPix', 'android_downloads' => 30000, 'rating' => 3.2, 'review_count' => 310, 'current_version' => '1.9.0'],
                'stage' => 'new_lead', 'source' => 'App Store Search', 'priority' => 'low', 'budget' => 8000,
            ],
            [
                'name' => 'ZenSleep', 'website' => 'zensleep.co', 'industry' => 'Health & Fitness',
                'country' => 'AU', 'size' => '11-50', 'revenue' => 650000,
                'contact' => ['name' => 'Olivia Brown', 'position' => 'Head of Growth', 'email' => 'olivia@zensleep.co'],
                'app' => ['name' => 'ZenSleep', 'android_downloads' => 700000, 'rating' => 4.4, 'review_count' => 5400, 'current_version' => '3.0.5'],
                'stage' => 'audit_ready', 'source' => 'Play Store Search', 'priority' => 'high', 'budget' => 35000,
            ],
            [
                'name' => 'ShopStreet', 'website' => 'shopstreet.com', 'industry' => 'E-commerce',
                'country' => 'CA', 'size' => '51-200', 'revenue' => 2800000,
                'contact' => ['name' => 'Nathan Lee', 'position' => 'CTO', 'email' => 'nathan@shopstreet.com'],
                'app' => ['name' => 'ShopStreet', 'android_downloads' => 850000, 'rating' => 4.1, 'review_count' => 6200, 'current_version' => '2.8.3'],
                'stage' => 'negotiation', 'source' => 'Website Discovery', 'priority' => 'high', 'budget' => 50000,
            ],
            [
                'name' => 'FitEats', 'website' => 'fiteats.io', 'industry' => 'Food & Drink',
                'country' => 'US', 'size' => '11-50', 'revenue' => 900000,
                'contact' => ['name' => 'Diana Miller', 'position' => 'Product Owner', 'email' => 'diana@fiteats.io'],
                'app' => ['name' => 'FitEats', 'android_downloads' => 210000, 'rating' => 3.9, 'review_count' => 2100, 'current_version' => '2.0.1'],
                'stage' => 'won', 'source' => 'Referral', 'priority' => 'high', 'budget' => 28000,
            ],
            [
                'name' => 'TaskFlow', 'website' => 'taskflow.co', 'industry' => 'Productivity',
                'country' => 'NL', 'size' => '51-200', 'revenue' => 1700000,
                'contact' => ['name' => 'Jan de Vries', 'position' => 'Engineering Manager', 'email' => 'jan@taskflow.co'],
                'app' => ['name' => 'TaskFlow', 'android_downloads' => 520000, 'rating' => 4.3, 'review_count' => 3900, 'current_version' => '6.1.0'],
                'stage' => 'lost', 'source' => 'LinkedIn', 'priority' => 'medium', 'budget' => 22000,
            ],
        ];

        $ai = app(AIService::class);

        foreach ($companies as $data) {
            $company = Company::updateOrCreate(
                ['user_id' => $user->id, 'name' => $data['name']],
                collect($data)->except(['contact', 'app', 'stage', 'source', 'priority', 'budget'])->toArray()
            );

            $contact = Contact::updateOrCreate(
                ['company_id' => $company->id, 'email' => $data['contact']['email']],
                array_merge($data['contact'], ['is_primary' => true])
            );

            $lead = Lead::updateOrCreate(
                ['user_id' => $user->id, 'company_id' => $company->id, 'contact_id' => $contact->id],
                [
                    'stage' => $data['stage'],
                    'status' => in_array($data['stage'], ['won', 'lost']) ? $data['stage'] : 'active',
                    'source' => $data['source'],
                    'priority' => $data['priority'],
                    'estimated_budget' => $data['budget'],
                    'next_followup_at' => now()->addDays(rand(1, 7)),
                    'last_contacted_at' => now()->subDays(rand(0, 5)),
                ]
            );

            $lead->app()->updateOrCreate(
                ['lead_id' => $lead->id],
                $data['app']
            );

            $score = $ai->scoreLead($lead->fresh(['app', 'company']));
            $lead->update(['lead_score' => $score['score']]);

            $this->seedLeadChildren($user, $lead, $data['stage']);
        }
    }

    private function seedLeadChildren(User $user, Lead $lead, string $stage): void
    {
        $emails = rand(1, 4);
        $statuses = ['sent', 'opened', 'clicked', 'replied'];
        for ($i = 0; $i < $emails; $i++) {
            Email::updateOrCreate(
                ['user_id' => $user->id, 'lead_id' => $lead->id, 'subject' => "Email {$i} to {$lead->company->name}"],
                [
                    'direction' => 'outbound',
                    'body' => "Hi {$lead->contact->name},\n\nThis is outreach email number {$i} for {$lead->company->name}.",
                    'to_email' => $lead->contact->email,
                    'status' => $statuses[$i] ?? 'sent',
                    'sent_at' => now()->subDays($i + 1),
                ]
            );
        }

        if ($stage === 'meeting' || $stage === 'proposal_sent' || $stage === 'negotiation' || $stage === 'won') {
            Meeting::updateOrCreate(
                ['user_id' => $user->id, 'lead_id' => $lead->id, 'title' => "Intro call with {$lead->company->name}"],
                [
                    'starts_at' => now()->addDays(rand(1, 5))->setTime(14, 0),
                    'ends_at' => now()->addDays(rand(1, 5))->setTime(14, 45),
                    'status' => 'scheduled',
                ]
            );
        }

        Note::updateOrCreate(
            ['user_id' => $user->id, 'lead_id' => $lead->id, 'content' => "Initial research notes for {$lead->company->name}"],
            ['content' => "Initial research notes for {$lead->company->name}"]
        );

        if (in_array($stage, ['audit_ready', 'contacted', 'followup_1', 'followup_2', 'meeting', 'proposal_sent', 'negotiation', 'won'])) {
            $audit = Audit::updateOrCreate(
                ['lead_id' => $lead->id, 'summary' => 'Initial app audit'],
                ['completed_at' => now()->subDays(rand(1, 10))]
            );
            AuditItem::updateOrCreate(
                ['audit_id' => $audit->id, 'title' => 'Slow onboarding'],
                ['category' => 'ui_ux', 'description' => 'Onboarding takes too many steps.', 'severity' => 'high', 'ai_recommendation' => 'Reduce onboarding to essential steps and add a skip button.']
            );
            AuditItem::updateOrCreate(
                ['audit_id' => $audit->id, 'title' => 'Missing subscription upsell'],
                ['category' => 'revenue', 'description' => 'No paywall or trial offered.', 'severity' => 'medium', 'ai_recommendation' => 'Introduce a 7-day free trial after onboarding.']
            );
            $audit->refreshCounts();
        }

        if (in_array($stage, ['contacted', 'followup_1', 'followup_2', 'meeting', 'proposal_sent', 'negotiation', 'won'])) {
            for ($i = 1; $i <= 3; $i++) {
                Followup::updateOrCreate(
                    ['lead_id' => $lead->id, 'sequence_number' => $i],
                    [
                        'user_id' => $user->id,
                        'due_date' => now()->addDays(FollowupEngine::SEQUENCE[$i] ?? 4)->toDateString(),
                        'is_completed' => false,
                    ]
                );
            }
        }

        if (in_array($stage, ['proposal_sent', 'negotiation', 'won'])) {
            Proposal::updateOrCreate(
                ['lead_id' => $lead->id, 'title' => "Proposal for {$lead->company->name}"],
                ['amount' => $lead->estimated_budget, 'status' => 'sent', 'sent_at' => now()->subDays(rand(1, 5))]
            );
        }

        Activity::updateOrCreate(
            ['user_id' => $user->id, 'lead_id' => $lead->id, 'type' => 'lead_created'],
            ['description' => "Lead created for {$lead->company->name}", 'created_at' => now()->subDays(rand(1, 15))]
        );

        Task::updateOrCreate(
            ['user_id' => $user->id, 'lead_id' => $lead->id, 'title' => "Follow up with {$lead->company->name}"],
            ['due_date' => now()->addDays(rand(1, 5)), 'is_completed' => false]
        );
    }
}