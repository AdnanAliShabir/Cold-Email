<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Setting extends Model
{
    use HasFactory;

    protected $fillable = ['user_id', 'key', 'value'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array<string, mixed> */
    public static function mapForUser(int $userId): array
    {
        return static::where('user_id', $userId)->get()
            ->mapWithKeys(fn (self $s) => [$s->key => static::normalizeValue($s->value)])
            ->all();
    }

    public static function getValue(int $userId, string $key, mixed $default = null): mixed
    {
        $row = static::where('user_id', $userId)->where('key', $key)->first();

        return $row ? static::normalizeValue($row->value) : $default;
    }

    public static function putValue(int $userId, string $key, mixed $value): self
    {
        return static::updateOrCreate(
            ['user_id' => $userId, 'key' => $key],
            ['value' => $value],
        );
    }

    private static function normalizeValue(mixed $value): mixed
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $value = $decoded;
            }
        }

        if (is_array($value)) {
            if (array_key_exists('v', $value) && count($value) === 1) {
                return $value['v'];
            }
            if (array_key_exists('value', $value) && count($value) === 1) {
                return $value['value'];
            }
        }

        return $value;
    }

    protected function casts(): array
    {
        return [
            'value' => 'json',
        ];
    }
}
