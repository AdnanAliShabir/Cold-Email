<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Lead extends Model
{
    use HasFactory;

    public const STAGES = [
        'new_lead',
        'researching',
        'audit_ready',
        'contacted',
        'followup_1',
        'followup_2',
        'meeting',
        'proposal_sent',
        'negotiation',
        'won',
        'lost',
    ];

    public const STATUSES = ['new', 'active', 'won', 'lost'];

    public const PRIORITIES = ['low', 'medium', 'high'];

    protected $fillable = [
        'user_id', 'company_id', 'contact_id', 'stage', 'status', 'source',
        'priority', 'estimated_budget', 'lead_score', 'next_followup_at',
        'last_contacted_at', 'notes',
    ];

    protected $casts = [
        'estimated_budget' => 'decimal:2',
        'lead_score' => 'integer',
        'next_followup_at' => 'datetime',
        'last_contacted_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function app(): HasOne
    {
        return $this->hasOne(App::class);
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(LeadStatusHistory::class);
    }

    public function audits(): HasMany
    {
        return $this->hasMany(Audit::class);
    }

    public function emails(): HasMany
    {
        return $this->hasMany(Email::class);
    }

    public function meetings(): HasMany
    {
        return $this->hasMany(Meeting::class);
    }

    public function notes(): HasMany
    {
        return $this->hasMany(Note::class);
    }

    public function followups(): HasMany
    {
        return $this->hasMany(Followup::class);
    }

    public function proposals(): HasMany
    {
        return $this->hasMany(Proposal::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    public static function stageLabel(string $stage): string
    {
        return match ($stage) {
            'new_lead' => 'New Lead',
            'researching' => 'Researching',
            'audit_ready' => 'Audit Ready',
            'contacted' => 'Contacted',
            'followup_1' => 'Follow-up 1',
            'followup_2' => 'Follow-up 2',
            'meeting' => 'Meeting',
            'proposal_sent' => 'Proposal Sent',
            'negotiation' => 'Negotiation',
            'won' => 'Won',
            'lost' => 'Lost',
            default => ucfirst(str_replace('_', ' ', $stage)),
        };
    }
}