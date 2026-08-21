<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\Contact;
use App\Models\App;
use App\Models\Lead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class LeadController extends Controller
{
    private const VALID_STAGES = [
        'new_lead', 'researching', 'audit_ready', 'contacted', 'followup_1',
        'followup_2', 'meeting', 'proposal_sent', 'negotiation', 'won', 'lost',
    ];

    public function index(Request $request): JsonResponse
    {
        $query = Lead::with(['company', 'contact', 'app', 'emails'])
            ->where('user_id', $request->user()->id);

        if ($request->filled('stage')) {
            $query->where('stage', $request->query('stage'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('search')) {
            $search = $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->whereHas('company', fn ($c) => $c->where('name', 'ilike', "%{$search}%"))
                    ->orWhereHas('contact', fn ($c) => $c->where('name', 'ilike', "%{$search}%"))
                    ->orWhereHas('app', fn ($a) => $a->where('name', 'ilike', "%{$search}%"));
            });
        }

        $leads = $query->orderByDesc('updated_at')->paginate($request->integer('per_page', 25));

        return response()->json($leads->through(fn ($lead) => $this->transform($lead)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedData($request);

        try {
            $lead = DB::transaction(function () use ($request, $data) {
                $companyName = trim($data['company']['name'] ?? '') ?: 'Unknown Company';
                $company = Company::firstOrCreate(
                    ['user_id' => $request->user()->id, 'name' => $companyName],
                    array_merge($data['company'] ?? [], ['user_id' => $request->user()->id, 'name' => $companyName])
                );

                $contact = null;
                if (! empty($data['contact']['name'] ?? '')) {
                    $contactData = $data['contact'];
                    unset($contactData['is_primary']);
                    $contact = $company->contacts()->updateOrCreate(
                        ['company_id' => $company->id, 'email' => $contactData['email'] ?? null],
                        array_merge($contactData, ['is_primary' => true])
                    );
                }

                $lead = Lead::create(array_merge(
                    $this->buildLeadFields($data),
                    [
                        'user_id' => $request->user()->id,
                        'company_id' => $company->id,
                        'contact_id' => $contact?->id,
                        'stage' => $data['stage'] ?? 'new_lead',
                        'status' => $data['status'] ?? 'new',
                        'priority' => $data['priority'] ?? 'medium',
                    ]
                ));

                if (isset($data['app'])) {
                    $lead->app()->create($this->sanitizeApp($data['app']));
                }

                $this->logActivity($lead, 'lead_created', 'Lead created');

                return $lead->fresh(['company', 'contact', 'app']);
            });

            return response()->json(['lead' => $this->transform($lead)], 201);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Could not create lead', 'error' => $e->getMessage()], 422);
        }
    }

    public function show(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize($request, $lead);
        $lead->load(['company.contacts', 'contact', 'app', 'emails', 'meetings', 'notes', 'followups', 'proposals', 'tasks', 'audits.items', 'activities']);

        return response()->json(['lead' => $this->transform($lead, true)]);
    }

    public function update(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize($request, $lead);
        $data = $this->validatedData($request);

        DB::transaction(function () use ($request, $lead, $data) {
            $lead->update($this->buildLeadFields($data));

            if (isset($data['company'])) {
                $lead->company?->update($data['company']);
            }
            if (isset($data['contact']) && $lead->contact) {
                $lead->contact->update($data['contact']);
            }
            if ($lead->app) {
                $lead->app->update($this->sanitizeApp($data['app'] ?? []));
            }
        });

        $lead->refresh();
        $this->logActivity($lead, 'stage_changed', 'Lead updated');

        return response()->json(['lead' => $this->transform($lead, true)]);
    }

    public function destroy(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize($request, $lead);
        $lead->delete();

        return response()->json(['message' => 'Lead deleted']);
    }

    private function buildLeadFields(array $data): array
    {
        $fields = [
            'source', 'priority', 'stage', 'status', 'estimated_budget',
            'lead_score', 'next_followup_at', 'last_contacted_at', 'notes',
        ];

        return collect($data)->only($fields)->filter(fn ($v) => $v !== null)->all();
    }

    private function sanitizeApp(array $app): array
    {
        // Drop null/empty values so DB-level defaults (e.g. review_count default 0)
        // apply and the NOT NULL columns never receive null.
        return collect($app)
            ->map(fn ($v) => is_string($v) ? trim($v) : $v)
            ->filter(fn ($v) => $v !== null && $v !== '')
            ->all();
    }

    private function validatedData(Request $request): array
    {
        return $request->validate([
            'company.name' => ['nullable', 'string', 'max:255'],
            'company.website' => ['nullable', 'string', 'max:255'],
            'company.industry' => ['nullable', 'string', 'max:255'],
            'company.country' => ['nullable', 'string', 'max:255'],
            'company.size' => ['nullable', 'string', 'max:255'],
            'company.revenue' => ['nullable', 'numeric'],
            'contact.name' => ['nullable', 'string', 'max:255'],
            'contact.position' => ['nullable', 'string', 'max:255'],
            'contact.email' => ['nullable', 'email', 'max:255'],
            'contact.phone' => ['nullable', 'string', 'max:255'],
            'contact.linkedin' => ['nullable', 'string', 'max:255'],
            'app.name' => ['nullable', 'string', 'max:255'],
            'app.google_play_url' => ['nullable', 'string', 'max:255'],
            'app.app_store_url' => ['nullable', 'string', 'max:255'],
            'app.android_downloads' => ['nullable', 'integer'],
            'app.ios_downloads' => ['nullable', 'integer'],
            'app.rating' => ['nullable', 'numeric', 'min:0', 'max:5'],
            'app.review_count' => ['nullable', 'integer'],
            'app.current_version' => ['nullable', 'string', 'max:255'],
            'stage' => ['sometimes', 'in:' . implode(',', self::VALID_STAGES)],
            'status' => ['sometimes', 'string'],
            'source' => ['nullable', 'string', 'max:255'],
            'priority' => ['nullable', 'in:low,medium,high'],
            'estimated_budget' => ['nullable', 'numeric'],
            'lead_score' => ['nullable', 'integer', 'between:0,100'],
            'next_followup_at' => ['nullable', 'date'],
            'last_contacted_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
    }

    private function authorize(Request $request, Lead $lead): void
    {
        abort_unless($lead->user_id === $request->user()->id, 403, 'Not authorized');
    }

    private function logActivity(Lead $lead, string $type, string $description): void
    {
        $lead->activities()->create([
            'user_id' => $lead->user_id,
            'type' => $type,
            'description' => $description,
        ]);
    }

    private function transform(Lead $lead, bool $detailed = false): array
    {
        $data = [
            'id' => $lead->id,
            'stage' => $lead->stage,
            'stage_label' => Lead::stageLabel($lead->stage),
            'status' => $lead->status,
            'source' => $lead->source,
            'priority' => $lead->priority,
            'estimated_budget' => $lead->estimated_budget,
            'lead_score' => $lead->lead_score,
            'next_followup_at' => $lead->next_followup_at?->toIso8601String(),
            'last_contacted_at' => $lead->last_contacted_at?->toIso8601String(),
            'company' => $lead->company,
            'contact' => $lead->contact,
            'app' => $lead->app,
            'created_at' => $lead->created_at?->toIso8601String(),
            'updated_at' => $lead->updated_at?->toIso8601String(),
        ];

        if ($detailed) {
            $data['emails'] = $lead->emails ?? collect();
            $data['meetings'] = $lead->meetings ?? collect();
            $data['notes'] = $lead->notes ?? collect();
            $data['followups'] = $lead->followups ?? collect();
            $data['proposals'] = $lead->proposals ?? collect();
            $data['tasks'] = $lead->tasks ?? collect();
            $data['audits'] = $lead->audits ?? collect();
            $data['activities'] = $lead->activities ?? collect();
        }

        return $data;
    }
}