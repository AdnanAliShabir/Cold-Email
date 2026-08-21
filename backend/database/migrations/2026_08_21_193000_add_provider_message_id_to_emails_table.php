<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('emails', function (Blueprint $table) {
            $table->string('provider_message_id')->nullable()->unique()->after('to_email');
            $table->string('provider')->nullable()->after('provider_message_id');
        });
    }

    public function down(): void
    {
        Schema::table('emails', function (Blueprint $table) {
            $table->dropColumn(['provider_message_id', 'provider']);
        });
    }
};
