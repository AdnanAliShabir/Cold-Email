<?php

use App\Http\Controllers\Api\AIController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\Auth\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EmailController;
use App\Http\Controllers\Api\EmailTemplateController;
use App\Http\Controllers\Api\FollowupController;
use App\Http\Controllers\Api\LeadController;
use App\Http\Controllers\Api\MeetingController;
use App\Http\Controllers\Api\NoteController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PipelineController;
use App\Http\Controllers\Api\ProposalController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\StatisticsController;
use App\Http\Controllers\Api\TaskController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', fn (Request $request) => $request->user());
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::apiResource('leads', LeadController::class);

    Route::get('pipeline', [PipelineController::class, 'board']);
    Route::put('pipeline/{lead}/stage', [PipelineController::class, 'updateStage']);

    Route::get('followups/due', [FollowupController::class, 'due']);
    Route::get('followups/upcoming', [FollowupController::class, 'upcoming']);
    Route::get('followups', [FollowupController::class, 'index']);
    Route::post('followups/{followup}/complete', [FollowupController::class, 'complete']);

    Route::get('dashboard', [DashboardController::class, 'index']);
    Route::get('statistics', [StatisticsController::class, 'overview']);

    Route::apiResource('audits', AuditController::class)->except(['update']);
    Route::post('audits/{audit}/items', [AuditController::class, 'addItem']);
    Route::put('audit-items/{item}', [AuditController::class, 'updateItem']);

    Route::apiResource('templates', EmailTemplateController::class);

    Route::apiResource('emails', EmailController::class)->only(['index', 'store']);
    Route::put('emails/{email}/status', [EmailController::class, 'updateStatus']);

    Route::apiResource('tasks', TaskController::class)->except(['show']);
    Route::post('tasks/{task}/toggle', [TaskController::class, 'toggle']);

    Route::apiResource('notes', NoteController::class)->only(['index', 'store', 'destroy']);
    Route::apiResource('meetings', MeetingController::class)->except(['show']);

    Route::apiResource('proposals', ProposalController::class)->except(['show']);

    Route::get('notifications', [NotificationController::class, 'index']);
    Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('notifications/{notification}/read', [NotificationController::class, 'markRead']);

    Route::get('settings', [SettingsController::class, 'index']);
    Route::put('settings', [SettingsController::class, 'update']);

    Route::post('ai/review-analysis', [AIController::class, 'reviewAnalysis']);
    Route::post('ai/audit-generator', [AIController::class, 'auditGenerator']);
    Route::post('ai/outreach', [AIController::class, 'outreach']);
    Route::post('ai/lead-score/{lead}', [AIController::class, 'leadScore']);
});