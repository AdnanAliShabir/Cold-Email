<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditItem extends Model
{
    use HasFactory;

    public const CATEGORIES = ['ui_ux', 'performance', 'store', 'revenue'];
    public const SEVERITIES = ['critical', 'high', 'medium', 'low'];

    protected $fillable = [
        'audit_id', 'category', 'title', 'description', 'severity',
        'screenshot_path', 'notes', 'ai_recommendation',
    ];

    public function audit(): BelongsTo
    {
        return $this->belongsTo(Audit::class);
    }
}