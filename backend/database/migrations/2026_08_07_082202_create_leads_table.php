<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('contact_id')->nullable()->constrained()->nullOnDelete();
            $table->string('stage')->default('new_lead');
            $table->string('status')->default('new');
            $table->string('source')->nullable();
            $table->string('priority')->default('medium');
            $table->decimal('estimated_budget', 15, 2)->nullable();
            $table->integer('lead_score')->nullable();
            $table->timestamp('next_followup_at')->nullable();
            $table->timestamp('last_contacted_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'stage']);
            $table->index(['user_id', 'status']);
            $table->index('next_followup_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leads');
    }
};