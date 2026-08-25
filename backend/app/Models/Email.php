<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Email extends Model
{
    use HasFactory;

    public const STATUSES = ['draft', 'sent', 'opened', 'clicked', 'replied', 'received'];

    protected $fillable = [
        'user_id', 'lead_id', 'template_id', 'in_reply_to_email_id', 'direction', 'subject', 'body',
        'from_email', 'from_name', 'to_email', 'provider_message_id', 'provider',
        'status', 'sent_at', 'opened_at', 'clicked_at', 'replied_at',
    ];

    protected $casts = [
        'sent_at' => 'datetime',
        'opened_at' => 'datetime',
        'clicked_at' => 'datetime',
        'replied_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(EmailTemplate::class, 'template_id');
    }

    public function inReplyTo(): BelongsTo
    {
        return $this->belongsTo(self::class, 'in_reply_to_email_id');
    }
}