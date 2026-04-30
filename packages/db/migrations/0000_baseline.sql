CREATE TYPE "public"."alert_category" AS ENUM('task_failure', 'employee_error', 'system_error', 'performance', 'security');--> statement-breakpoint
CREATE TYPE "public"."alert_severity" AS ENUM('critical', 'warning', 'info');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('open', 'acknowledged', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('web', 'wecom', 'dingtalk', 'feishu', 'discord', 'telegram', 'api', 'wxoa', 'email');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('standby', 'active', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'system', 'tool');--> statement-breakpoint
CREATE TYPE "public"."permission_type" AS ENUM('admin', 'write', 'read');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."sandbox_run_status" AS ENUM('pending', 'running', 'waiting_for_input', 'completed', 'failed', 'cancelled', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."sandbox_run_type" AS ENUM('node_test', 'workflow_run', 'sop_run');--> statement-breakpoint
CREATE TYPE "public"."sop_execution_status" AS ENUM('pending', 'running', 'paused_for_human', 'completed', 'timed_out', 'error', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sop_node_status" AS ENUM('pending', 'running', 'completed', 'skipped', 'error');--> statement-breakpoint
CREATE TYPE "public"."sop_pause_decision" AS ENUM('approved', 'rejected', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."sop_pause_status" AS ENUM('waiting', 'decided', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."sop_trigger_type" AS ENUM('scheduled', 'event', 'manual');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'running', 'success', 'failed', 'hitl_waiting');--> statement-breakpoint
CREATE TYPE "public"."task_trigger_type" AS ENUM('scheduled', 'manual', 'event', 'webhook', 'api', 'sop', 'conversation');--> statement-breakpoint
CREATE TYPE "public"."work_log_type" AS ENUM('action', 'decision', 'tool_call', 'llm_call', 'error');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anomaly_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"category" "alert_category" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"employee_id" text,
	"employee_name" text,
	"task_execution_id" text,
	"error_message" text,
	"error_stack" text,
	"metadata" jsonb DEFAULT '{}',
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"created_by" text,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"type" text DEFAULT 'personal' NOT NULL,
	"last_used" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "api_key_key_unique" UNIQUE("key"),
	CONSTRAINT "workspace_type_check" CHECK ((type = 'workspace' AND workspace_id IS NOT NULL) OR (type = 'personal' AND workspace_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"actor_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"actor_name" text,
	"actor_email" text,
	"resource_name" text,
	"description" text,
	"metadata" jsonb DEFAULT '{}',
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" "conversation_channel" NOT NULL,
	"external_user_id" text NOT NULL,
	"external_session_id" text,
	"conversation_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text,
	"tool_calls" jsonb,
	"tool_call_id" text,
	"tool_name" text,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"channel" "conversation_channel" DEFAULT 'web' NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"title" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"stat_date" date NOT NULL,
	"total_tasks" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"hitl_count" integer DEFAULT 0 NOT NULL,
	"avg_duration_ms" integer,
	"tokens_consumed" integer DEFAULT 0 NOT NULL,
	"cost_rmb" numeric(12, 4) DEFAULT '0' NOT NULL,
	"custom_metrics" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_employees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"avatar" text,
	"description" text,
	"block_type" text NOT NULL,
	"status" "employee_status" DEFAULT 'standby' NOT NULL,
	"workflow_id" text,
	"model_config_id" text,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"schedule_config" jsonb,
	"persona" text,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_platform_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" "platform_role" DEFAULT 'member' NOT NULL,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_skill_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"instance_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_workflow_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_employees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"contact_methods" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_key" (
	"key" text PRIMARY KEY NOT NULL,
	"result" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"inviter_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"display_name" text NOT NULL,
	"api_key_encrypted" text,
	"api_endpoint" text,
	"model_name" text,
	"default_params" jsonb DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_result" text,
	"last_test_latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "model_usage_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_input" integer DEFAULT 0 NOT NULL,
	"tokens_output" integer DEFAULT 0 NOT NULL,
	"tokens_total" integer DEFAULT 0 NOT NULL,
	"cost_input" numeric(12, 6) DEFAULT '0' NOT NULL,
	"cost_output" numeric(12, 6) DEFAULT '0' NOT NULL,
	"cost_total" numeric(12, 6) DEFAULT '0' NOT NULL,
	"duration_ms" integer,
	"workflow_id" text,
	"workspace_id" text,
	"user_id" text,
	"employee_id" text,
	"status" text DEFAULT 'success' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" json,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_group" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"auto_add_new_members" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_group_member" (
	"id" text PRIMARY KEY NOT NULL,
	"permission_group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"permission_type" "permission_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_permission_defs" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role" "platform_role" NOT NULL,
	"permission_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"persona" text,
	"category" text DEFAULT 'general' NOT NULL,
	"icon" text,
	"block_type" text DEFAULT 'agent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sandbox_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"run_type" "sandbox_run_type" NOT NULL,
	"status" "sandbox_run_status" DEFAULT 'pending' NOT NULL,
	"workflow_id" text,
	"sop_definition_id" text,
	"target_node_id" text,
	"trigger_data" jsonb,
	"policy" jsonb,
	"node_results" jsonb DEFAULT '[]',
	"intercepted_calls" jsonb DEFAULT '[]',
	"execution_path" jsonb DEFAULT '[]',
	"mock_decisions" jsonb DEFAULT '{}',
	"error_message" text,
	"total_duration_ms" integer,
	"total_tokens_used" integer DEFAULT 0,
	"created_by" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sop_definition_id" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Shanghai' NOT NULL,
	"trigger_data" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"auto_connect" boolean DEFAULT true NOT NULL,
	"telemetry_enabled" boolean DEFAULT true NOT NULL,
	"email_preferences" json DEFAULT '{}' NOT NULL,
	"billing_usage_notifications_enabled" boolean DEFAULT true NOT NULL,
	"show_training_controls" boolean DEFAULT false NOT NULL,
	"super_user_mode_enabled" boolean DEFAULT true NOT NULL,
	"error_notifications_enabled" boolean DEFAULT true NOT NULL,
	"snap_to_grid_size" integer DEFAULT 0 NOT NULL,
	"show_action_bar" boolean DEFAULT true NOT NULL,
	"copilot_enabled_models" jsonb DEFAULT '{}' NOT NULL,
	"copilot_auto_allowed_tools" jsonb DEFAULT '[]' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "sop_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" "sop_trigger_type" DEFAULT 'manual' NOT NULL,
	"trigger_config" jsonb DEFAULT '{}' NOT NULL,
	"nodes" jsonb DEFAULT '[]' NOT NULL,
	"edges" jsonb DEFAULT '[]' NOT NULL,
	"sop_timeout_minutes" integer DEFAULT 1440 NOT NULL,
	"max_rejection_cycles" integer DEFAULT 3 NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"sop_definition_id" text,
	"sop_version" integer NOT NULL,
	"triggered_by" text NOT NULL,
	"scheduled_task_id" text,
	"status" "sop_execution_status" DEFAULT 'pending' NOT NULL,
	"state_snapshot" jsonb DEFAULT '{}' NOT NULL,
	"trigger_data" jsonb DEFAULT '{}',
	"retry_count" integer DEFAULT 0 NOT NULL,
	"rejection_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_node_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"node_id" text NOT NULL,
	"node_name" text NOT NULL,
	"node_type" text NOT NULL,
	"status" "sop_node_status" DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"workflow_run_id" text,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"exit_id" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sop_pause_states" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"node_id" text NOT NULL,
	"status" "sop_pause_status" DEFAULT 'waiting' NOT NULL,
	"assignee_id" text,
	"decision" "sop_pause_decision",
	"decided_by" text,
	"comment" text,
	"timeout_job_id" text,
	"expires_at" timestamp with time zone,
	"approval_token" text,
	"token_expires_at" timestamp with time zone,
	"card_response_code" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"config_encrypted" text NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_health_check" timestamp with time zone,
	"last_health_message_i18n" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"workflow_run_id" text,
	"sop_execution_id" text,
	"trigger_type" "task_trigger_type" NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}' NOT NULL,
	"output" jsonb,
	"input_summary" text,
	"output_summary" text,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"cost_rmb" numeric(12, 4) DEFAULT '0' NOT NULL,
	"duration_ms" integer,
	"error_message" text,
	"requires_review" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"keys_encrypted" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"name" text NOT NULL,
	"connection_id" text,
	"preset_params" jsonb,
	"env_vars" jsonb,
	"deploy" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"version" text DEFAULT 'V1.0.0' NOT NULL,
	"code" text,
	"parameters" jsonb,
	"preset_params" jsonb,
	"category" text,
	"author" text,
	"language" text DEFAULT 'javascript' NOT NULL,
	"source" text DEFAULT 'installed' NOT NULL,
	"url" text,
	"deploy" jsonb,
	"env_vars" jsonb,
	"api_doc" text,
	"connector_type" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"stripe_customer_id" text,
	"is_super_user" boolean DEFAULT false NOT NULL,
	"approval_status" text DEFAULT 'approved' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"log_type" "work_log_type" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"billed_account_user_id" text NOT NULL,
	"allow_personal_api_keys" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_files" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"context" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_files_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_alerts" ADD CONSTRAINT "anomaly_alerts_employee_id_digital_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."digital_employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_sessions" ADD CONSTRAINT "channel_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_sessions" ADD CONSTRAINT "channel_sessions_employee_id_digital_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."digital_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_employee_id_digital_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."digital_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_employee_id_digital_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."digital_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_employees" ADD CONSTRAINT "digital_employees_model_config_id_model_configs_id_fk" FOREIGN KEY ("model_config_id") REFERENCES "public"."model_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_connections" ADD CONSTRAINT "employee_connections_employee_id_digital_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."digital_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_connections" ADD CONSTRAINT "employee_connections_connection_id_system_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."system_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_platform_roles" ADD CONSTRAINT "employee_platform_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_platform_roles" ADD CONSTRAINT "employee_platform_roles_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_skill_bindings" ADD CONSTRAINT "employee_skill_bindings_employee_id_digital_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."digital_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_workflow_bindings" ADD CONSTRAINT "employee_workflow_bindings_employee_id_digital_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."digital_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_group" ADD CONSTRAINT "permission_group_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_group" ADD CONSTRAINT "permission_group_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_group_member" ADD CONSTRAINT "permission_group_member_permission_group_id_permission_group_id_fk" FOREIGN KEY ("permission_group_id") REFERENCES "public"."permission_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_group_member" ADD CONSTRAINT "permission_group_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_group_member" ADD CONSTRAINT "permission_group_member_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_permission_code_platform_permission_defs_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."platform_permission_defs"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_sop_definition_id_sop_definitions_id_fk" FOREIGN KEY ("sop_definition_id") REFERENCES "public"."sop_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_executions" ADD CONSTRAINT "sop_executions_sop_definition_id_sop_definitions_id_fk" FOREIGN KEY ("sop_definition_id") REFERENCES "public"."sop_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_node_executions" ADD CONSTRAINT "sop_node_executions_execution_id_sop_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."sop_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sop_pause_states" ADD CONSTRAINT "sop_pause_states_execution_id_sop_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."sop_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_employee_id_digital_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."digital_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_executions" ADD CONSTRAINT "task_executions_sop_execution_id_sop_executions_id_fk" FOREIGN KEY ("sop_execution_id") REFERENCES "public"."sop_executions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_instances" ADD CONSTRAINT "tool_instances_template_id_tools_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_instances" ADD CONSTRAINT "tool_instances_connection_id_system_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."system_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_task_id_task_executions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_employee_id_digital_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."digital_employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_billed_account_user_id_user_id_fk" FOREIGN KEY ("billed_account_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_files" ADD CONSTRAINT "workspace_files_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_account_on_account_id_provider_id" ON "account" USING btree ("account_id","provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_user_provider_unique" ON "account" USING btree ("user_id","provider_id");--> statement-breakpoint
CREATE INDEX "anomaly_alerts_severity_status_idx" ON "anomaly_alerts" USING btree ("severity","status");--> statement-breakpoint
CREATE INDEX "anomaly_alerts_category_idx" ON "anomaly_alerts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "anomaly_alerts_employee_id_idx" ON "anomaly_alerts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "anomaly_alerts_status_created_idx" ON "anomaly_alerts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "anomaly_alerts_created_at_idx" ON "anomaly_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_key_workspace_type_idx" ON "api_key" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "api_key_user_type_idx" ON "api_key" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_created_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_created_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_resource_idx" ON "audit_log" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "channel_sessions_channel_user_idx" ON "channel_sessions" USING btree ("channel","external_user_id");--> statement-breakpoint
CREATE INDEX "channel_sessions_conversation_id_idx" ON "channel_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "channel_sessions_employee_id_idx" ON "channel_sessions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "conv_messages_conversation_id_idx" ON "conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conv_messages_role_idx" ON "conversation_messages" USING btree ("role");--> statement-breakpoint
CREATE INDEX "conv_messages_created_at_idx" ON "conversation_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversations_employee_id_idx" ON "conversations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversations_channel_idx" ON "conversations" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "conversations_last_message_at_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "daily_stats_employee_id_idx" ON "daily_stats" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "daily_stats_stat_date_idx" ON "daily_stats" USING btree ("stat_date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_stats_employee_date_unique" ON "daily_stats" USING btree ("employee_id","stat_date");--> statement-breakpoint
CREATE INDEX "digital_employees_status_idx" ON "digital_employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "digital_employees_workflow_id_idx" ON "digital_employees" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "digital_employees_model_config_id_idx" ON "digital_employees" USING btree ("model_config_id");--> statement-breakpoint
CREATE INDEX "ec_employee_id_idx" ON "employee_connections" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ec_connection_id_idx" ON "employee_connections" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ec_unique_idx" ON "employee_connections" USING btree ("employee_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_platform_roles_user_id_unique" ON "employee_platform_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "employee_platform_roles_role_idx" ON "employee_platform_roles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "employee_platform_roles_disabled_idx" ON "employee_platform_roles" USING btree ("is_disabled");--> statement-breakpoint
CREATE INDEX "esb_employee_id_idx" ON "employee_skill_bindings" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "esb_skill_id_idx" ON "employee_skill_bindings" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "esb_instance_id_idx" ON "employee_skill_bindings" USING btree ("instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "esb_unique_instance_idx" ON "employee_skill_bindings" USING btree ("employee_id","instance_id");--> statement-breakpoint
CREATE INDEX "ewb_employee_id_idx" ON "employee_workflow_bindings" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ewb_workflow_id_idx" ON "employee_workflow_bindings" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ewb_unique_idx" ON "employee_workflow_bindings" USING btree ("employee_id","workflow_id");--> statement-breakpoint
CREATE INDEX "human_emp_name_idx" ON "human_employees" USING btree ("name");--> statement-breakpoint
CREATE INDEX "human_emp_title_idx" ON "human_employees" USING btree ("title");--> statement-breakpoint
CREATE INDEX "idempotency_key_created_at_idx" ON "idempotency_key" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_user_id_unique" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "model_configs_provider_id_idx" ON "model_configs" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "model_configs_is_active_idx" ON "model_configs" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "model_usage_logs_model_idx" ON "model_usage_logs" USING btree ("model");--> statement-breakpoint
CREATE INDEX "model_usage_logs_provider_idx" ON "model_usage_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "model_usage_logs_created_at_idx" ON "model_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "model_usage_logs_workspace_id_idx" ON "model_usage_logs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "model_usage_logs_employee_id_idx" ON "model_usage_logs" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "model_usage_logs_model_created_at_idx" ON "model_usage_logs" USING btree ("model","created_at");--> statement-breakpoint
CREATE INDEX "permission_group_organization_id_idx" ON "permission_group" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "permission_group_created_by_idx" ON "permission_group" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_group_org_name_unique" ON "permission_group" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_group_org_auto_add_unique" ON "permission_group" USING btree ("organization_id") WHERE auto_add_new_members = true;--> statement-breakpoint
CREATE INDEX "permission_group_member_group_id_idx" ON "permission_group_member" USING btree ("permission_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_group_member_user_id_unique" ON "permission_group_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "permissions_user_id_idx" ON "permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "permissions_entity_idx" ON "permissions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "permissions_user_entity_type_idx" ON "permissions" USING btree ("user_id","entity_type");--> statement-breakpoint
CREATE INDEX "permissions_user_entity_permission_idx" ON "permissions" USING btree ("user_id","entity_type","permission_type");--> statement-breakpoint
CREATE INDEX "permissions_user_entity_idx" ON "permissions" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_unique_constraint" ON "permissions" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "platform_permission_defs_category_idx" ON "platform_permission_defs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "platform_permission_defs_sort_order_idx" ON "platform_permission_defs" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_role_perms_role_perm_unique" ON "platform_role_permissions" USING btree ("role","permission_code");--> statement-breakpoint
CREATE INDEX "platform_role_perms_role_idx" ON "platform_role_permissions" USING btree ("role");--> statement-breakpoint
CREATE INDEX "roles_category_idx" ON "roles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "roles_created_at_idx" ON "roles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sandbox_runs_workflow_id_idx" ON "sandbox_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "sandbox_runs_sop_definition_id_idx" ON "sandbox_runs" USING btree ("sop_definition_id");--> statement-breakpoint
CREATE INDEX "sandbox_runs_status_idx" ON "sandbox_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sandbox_runs_run_type_idx" ON "sandbox_runs" USING btree ("run_type");--> statement-breakpoint
CREATE INDEX "sandbox_runs_created_at_idx" ON "sandbox_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sandbox_runs_created_by_idx" ON "sandbox_runs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "st_sop_definition_id_idx" ON "scheduled_tasks" USING btree ("sop_definition_id");--> statement-breakpoint
CREATE INDEX "st_is_active_idx" ON "scheduled_tasks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "st_next_run_at_idx" ON "scheduled_tasks" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "st_created_by_idx" ON "scheduled_tasks" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_token_idx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sop_definitions_name_idx" ON "sop_definitions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sop_definitions_trigger_type_idx" ON "sop_definitions" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "sop_definitions_is_active_idx" ON "sop_definitions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sop_definitions_created_at_idx" ON "sop_definitions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sop_definitions_created_by_idx" ON "sop_definitions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "sop_exec_definition_id_idx" ON "sop_executions" USING btree ("sop_definition_id");--> statement-breakpoint
CREATE INDEX "sop_exec_status_idx" ON "sop_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sop_exec_status_created_idx" ON "sop_executions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "sop_exec_started_at_idx" ON "sop_executions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "sop_exec_triggered_by_idx" ON "sop_executions" USING btree ("triggered_by");--> statement-breakpoint
CREATE INDEX "sop_node_exec_execution_id_idx" ON "sop_node_executions" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "sop_node_exec_exec_node_idx" ON "sop_node_executions" USING btree ("execution_id","node_id");--> statement-breakpoint
CREATE INDEX "sop_node_exec_status_idx" ON "sop_node_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sop_pause_execution_id_idx" ON "sop_pause_states" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "sop_pause_exec_node_idx" ON "sop_pause_states" USING btree ("execution_id","node_id");--> statement-breakpoint
CREATE INDEX "sop_pause_status_idx" ON "sop_pause_states" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sop_pause_approval_token_idx" ON "sop_pause_states" USING btree ("approval_token");--> statement-breakpoint
CREATE INDEX "system_connections_type_idx" ON "system_connections" USING btree ("type");--> statement-breakpoint
CREATE INDEX "system_connections_status_idx" ON "system_connections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_executions_employee_id_idx" ON "task_executions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "task_executions_status_idx" ON "task_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_executions_employee_status_idx" ON "task_executions" USING btree ("employee_id","status");--> statement-breakpoint
CREATE INDEX "task_executions_workflow_run_id_idx" ON "task_executions" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "task_executions_started_at_idx" ON "task_executions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "task_executions_requires_review_idx" ON "task_executions" USING btree ("requires_review");--> statement-breakpoint
CREATE INDEX "ti_template_id_idx" ON "tool_instances" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "ti_connection_id_idx" ON "tool_instances" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "ti_created_by_idx" ON "tool_instances" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "tools_category_idx" ON "tools" USING btree ("category");--> statement-breakpoint
CREATE INDEX "tools_created_by_idx" ON "tools" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "work_logs_task_id_idx" ON "work_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "work_logs_employee_id_idx" ON "work_logs" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "work_logs_log_type_idx" ON "work_logs" USING btree ("log_type");--> statement-breakpoint
CREATE INDEX "work_logs_task_log_type_idx" ON "work_logs" USING btree ("task_id","log_type");--> statement-breakpoint
CREATE INDEX "work_logs_created_at_idx" ON "work_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "workspace_files_key_idx" ON "workspace_files" USING btree ("key");--> statement-breakpoint
CREATE INDEX "workspace_files_user_id_idx" ON "workspace_files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_files_workspace_id_idx" ON "workspace_files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_files_context_idx" ON "workspace_files" USING btree ("context");