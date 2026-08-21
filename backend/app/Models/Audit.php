<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Audit extends Model
{
    use HasFactory;

    protected $fillable = [
        'lead_id', 'summary', 'total_findings',
        'critical_count', 'high_count', 'medium_count', 'low_count', 'completed_at',
    ];

    protected $casts = [
        'total_findings' => 'integer',
        'critical_count' => 'integer',
        'high_count' => 'integer',
        'medium_count' => 'integer',
        'low_count' => 'integer',
        'completed_at' => 'datetime',
    ];

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(AuditItem::class);
    }

    public function refreshCounts(): void
    {
        $counts = $this->items()->selectRaw("severity, count(*) as total")
            ->groupBy('severity')
            ->pluck('total', 'severity');

        $this->update([
            'total_findings' => $this->items()->count(),
            'critical_count' => (int) ($counts['critical'] ?? 0),
            'high_count' => (int) ($counts['high'] ?? 0),
            'medium_count' => (int) ($counts['medium'] ?? 0),
            'low_count' => (int) ($counts['low'] ?? 0),
        ]);
    }
}