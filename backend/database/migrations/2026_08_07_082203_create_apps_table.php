<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('apps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained()->cascadeOnDelete();
            $table->string('name')->nullable();
            $table->string('google_play_url')->nullable();
            $table->string('app_store_url')->nullable();
            $table->bigInteger('android_downloads')->nullable();
            $table->bigInteger('ios_downloads')->nullable();
            $table->decimal('rating', 3, 1)->nullable();
            $table->integer('review_count')->default(0);
            $table->string('current_version')->nullable();
            $table->timestamp('last_updated')->nullable();
            $table->timestamps();

            $table->index('lead_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('apps');
    }
};