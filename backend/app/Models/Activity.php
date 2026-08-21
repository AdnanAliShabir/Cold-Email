<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Activity extends Model
{
    use HasFactory;

    public const TYPES = [
        'lead_created', 'stage_changed', 'email_sent', 'meeting_scheduled',
        'note_added', 'proposal_sent', 'won', 'lost',
    ];

    protected $fillable = ['user_id', 'lead_id', 'type', 'description', 'metadata'];

    public $timestamps = false;

    protected $casts = [
        'metadata' => 'array',
        'created_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}