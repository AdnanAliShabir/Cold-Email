<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Proposal extends Model
{
    use HasFactory;

    public const STATUSES = ['draft', 'sent', 'accepted', 'rejected'];

    protected $fillable = ['lead_id', 'title', 'amount', 'status', 'sent_at'];

    protected $casts = [
        'amount' => 'decimal:2',
        'sent_at' => 'datetime',
    ];

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}