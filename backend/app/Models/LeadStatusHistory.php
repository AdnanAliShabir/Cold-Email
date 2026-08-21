<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadStatusHistory extends Model
{
    use HasFactory;

    protected $table = 'lead_status_history';

    protected $fillable = ['lead_id', 'stage', 'status', 'changed_at'];

    protected $casts = [
        'changed_at' => 'datetime',
    ];

    public $timestamps = true;

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}