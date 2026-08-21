<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class App extends Model
{
    use HasFactory;

    protected $fillable = [
        'lead_id', 'name', 'google_play_url', 'app_store_url',
        'android_downloads', 'ios_downloads', 'rating', 'review_count',
        'current_version', 'last_updated',
    ];

    protected $casts = [
        'android_downloads' => 'integer',
        'ios_downloads' => 'integer',
        'rating' => 'decimal:1',
        'review_count' => 'integer',
        'last_updated' => 'datetime',
    ];

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}