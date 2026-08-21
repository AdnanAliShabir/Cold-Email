<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('audit_id')->constrained()->cascadeOnDelete();
            $table->string('category'); // ui_ux, performance, store, revenue
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('severity'); // critical, high, medium, low
            $table->string('screenshot_path')->nullable();
            $table->text('notes')->nullable();
            $table->text('ai_recommendation')->nullable();
            $table->timestamps();

            $table->index(['audit_id', 'category']);
            $table->index('severity');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_items');
    }
};