import { runAllDueAgents } from '../agents';
import { cronPostQueue, cronFetchInsights, cronRefreshTokens, cronABTestAggregation } from './owner-marketing';

const CANCELLED_STATUS = 'cancelled' as const;
const SQL_ACTIVE_FILTER = `status != '${CANCELLED_STATUS}'` as const;

async function aiGetJson(kv: any, key: string): Promise<any> {
  try {
    const v = await kv.get(key, "json");
    return v || null;
  } catch {
    try {
      const v2 = await kv.get(key);
      return v2 ? JSON.parse(v2) : null;
    } catch {
      return null;
    }
  }
}

export async function scheduled(_event: any, env: any, _ctx: any): Promise<void> {
  const kv = (env as any).SAAS_FACTORY;
  if (!kv) return;

  // ── Outreach followup automation (Phase 4) ────────────────────────────────
  const db = (env as any).DB;
  if (db) {
    const OUTREACH_STAMP = "OUTREACH_FOLLOWUP_CRON_V1";
    try {
      const nowIso = new Date().toISOString();
      // Phase 4.5: Clear stale processing locks (older than 5 minutes)
      const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      await db.prepare(
        "UPDATE outreach_followups SET processing_at = NULL WHERE status = 'scheduled' AND processing_at IS NOT NULL AND processing_at < ?"
      ).bind(staleCutoff).run();

      // Find scheduled followups that are due and not being processed
      const followups = await db.prepare(
        `SELECT f.id, f.tenant_id, f.lead_id, f.step, f.attempt_count
         FROM outreach_followups f
         WHERE f.status = 'scheduled' AND f.scheduled_at <= ? AND f.processing_at IS NULL
         LIMIT 20`
      ).bind(nowIso).all();

      for (const row of (followups.results ?? []) as any[]) {
        const { id: fId, tenant_id: fTenantId, lead_id: fLeadId, step: fStep, attempt_count: fAttempts } = row;
        try {
          // Phase 4.5: Acquire processing lock
          await db.prepare(
            "UPDATE outreach_followups SET processing_at = ?, attempt_count = ? WHERE id = ? AND processing_at IS NULL"
          ).bind(nowIso, (fAttempts ?? 0) + 1, fId).run();
          // Check lead is still in contactable state
          const lead = await db.prepare(
            "SELECT id, pipeline_stage, store_name, contact_email, line_url FROM sales_leads WHERE id = ? AND tenant_id = ?"
          ).bind(fLeadId, fTenantId).first();

          if (!lead || ['lost', 'customer', 'meeting'].includes((lead as any).pipeline_stage)) {
            await db.prepare("UPDATE outreach_followups SET status = 'skipped' WHERE id = ?").bind(fId).run();
            continue;
          }

          // Check unsub
          const unsubKey = `outreach:unsub:${fTenantId}:${fLeadId}`;
          if (await kv.get(unsubKey) === "1") {
            await db.prepare("UPDATE outreach_followups SET status = 'skipped' WHERE id = ?").bind(fId).run();
            continue;
          }

          // Read outreach settings for send mode
          let sendMode: "safe" | "real" = "safe";
          try {
            const settingsRaw = await kv.get(`outreach:settings:${fTenantId}`);
            if (settingsRaw) sendMode = JSON.parse(settingsRaw).sendMode ?? "safe";
          } catch { /* default safe */ }

          // Generate followup message (AI when key available, otherwise template)
          const stepLabel = fStep === "first_followup" ? "1回目" : fStep === "second_followup" ? "2回目" : "最終";
          const isBreakup = fStep === "breakup";
          let fSubject: string;
          let fBody: string;

          const openaiKey = (env as any).OPENAI_API_KEY;
          if (openaiKey) {
            try {
              const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
                body: JSON.stringify({
                  model: "gpt-4o-mini",
                  messages: [
                    { role: "system", content: isBreakup
                      ? `あなたはB2B営業の担当者です。最終フォローアップ（breakup）メールを書いてください。丁寧に、しかし明確に「最後のご連絡」であることを伝え、今後は連絡しない旨を伝えてください。短く3-4文で。件名と本文をJSON形式で返してください: {"subject":"...", "body":"..."}`
                      : `あなたはB2B営業の担当者です。${stepLabel}のフォローアップメールを書いてください。前回の営業メールへの返信がない状況です。丁寧で簡潔に、3-4文で。件名と本文をJSON形式で返してください: {"subject":"...", "body":"..."}` },
                    { role: "user", content: `宛先: ${(lead as any).store_name}様` },
                  ],
                  response_format: { type: "json_object" },
                  temperature: 0.3, max_tokens: 300,
                }),
              });
              if (aiRes.ok) {
                const aiData = (await aiRes.json()) as any;
                const parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
                fSubject = parsed.subject || `${(lead as any).store_name}様 — フォローアップ（${stepLabel}）`;
                fBody = parsed.body || `${(lead as any).store_name}様\n\nフォローアップのご連絡です。`;
              } else {
                throw new Error(`AI ${aiRes.status}`);
              }
            } catch {
              // Fallback to template
              fSubject = `${(lead as any).store_name}様 — フォローアップ（${stepLabel}）`;
              fBody = isBreakup
                ? `${(lead as any).store_name}様\n\n何度かご連絡させていただきましたが、お忙しいところ恐縮です。\n本メールを最後のご連絡とさせていただきます。\nもし今後ご興味が出ましたら、いつでもお気軽にご連絡ください。`
                : `${(lead as any).store_name}様\n\n先日ご連絡させていただいた件につきまして、${stepLabel}のフォローアップをお送りいたします。\nご興味がございましたら、お気軽にご返信ください。`;
            }
          } else {
            fSubject = `${(lead as any).store_name}様 — フォローアップ（${stepLabel}）`;
            fBody = isBreakup
              ? `${(lead as any).store_name}様\n\n何度かご連絡させていただきましたが、お忙しいところ恐縮です。\n本メールを最後のご連絡とさせていただきます。\nもし今後ご興味が出ましたら、いつでもお気軽にご連絡ください。`
              : `${(lead as any).store_name}様\n\n先日ご連絡させていただいた件につきまして、${stepLabel}のフォローアップをお送りいたします。\nご興味がございましたら、お気軽にご返信ください。`;
          }

          // Save as draft
          const msgId = `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          await db.prepare(
            `INSERT INTO lead_message_drafts (id, lead_id, tenant_id, kind, subject, body, status, tone, created_at)
             VALUES (?, ?, ?, 'email', ?, ?, 'sent', 'friendly', ?)`
          ).bind(msgId, fLeadId, fTenantId, fSubject, fBody, nowIso).run();

          // Actually send via resolveProvider (real mode uses Resend, safe mode logs only)
          const { resolveProvider: resolveFuProvider } = await import("../outreach/send-provider");
          const fuProvider = resolveFuProvider(sendMode, {
            RESEND_API_KEY: (env as any).RESEND_API_KEY,
            EMAIL_FROM: (env as any).EMAIL_FROM,
          });
          const fuSendResult = await fuProvider.send({
            leadId: fLeadId,
            tenantId: fTenantId,
            channel: "email",
            to: (lead as any).contact_email || "",
            subject: fSubject,
            body: fBody,
          });

          // Record delivery event with actual send result
          const evtStatus = fuSendResult.success ? "sent" : "failed";
          const evtId = `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          await db.prepare(
            `INSERT INTO outreach_delivery_events (id, tenant_id, lead_id, message_id, channel, event_type, status, metadata_json, created_at)
             VALUES (?, ?, ?, ?, 'email', ?, ?, ?, ?)`
          ).bind(evtId, fTenantId, fLeadId, msgId, evtStatus, evtStatus, JSON.stringify({ provider: fuProvider.name, sendMode, step: fStep, messageId: fuSendResult.messageId || null, error: fuSendResult.error || null }), nowIso).run();

          // Update followup record (Phase 4.5: include provider_message_id, clear processing_at)
          const fuStatus = fuSendResult.success ? "sent" : "failed";
          await db.prepare(
            "UPDATE outreach_followups SET status = ?, sent_at = ?, message_id = ?, provider_message_id = ?, processing_at = NULL WHERE id = ?"
          ).bind(fuStatus, nowIso, msgId, fuSendResult.messageId || `${fuProvider.name}_${fId}`, fId).run();

          // Phase 4.5: Record normalized outreach event
          const oEvtId = `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
          await db.prepare(
            `INSERT INTO outreach_events (id, tenant_id, lead_id, type, metadata, created_at)
             VALUES (?, ?, ?, 'followup_send', ?, ?)`
          ).bind(oEvtId, fTenantId, fLeadId, JSON.stringify({ step: fStep, messageId: msgId, sendMode, provider: fuProvider.name, sent: fuSendResult.success }), nowIso).run();

          // Update last_contacted_at only if actually sent
          if (fuSendResult.success) {
            await db.prepare(
              "UPDATE sales_leads SET last_contacted_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?"
            ).bind(nowIso, nowIso, fLeadId, fTenantId).run();

            // Breakup: mark lead as 'lost' to prevent further outreach
            if (isBreakup) {
              await db.prepare(
                "UPDATE sales_leads SET pipeline_stage = 'lost', updated_at = ? WHERE id = ? AND tenant_id = ? AND pipeline_stage NOT IN ('meeting', 'customer')"
              ).bind(nowIso, fLeadId, fTenantId).run();
            }
          }

          console.log(`[${OUTREACH_STAMP}] ${fuStatus} ${fStep} to ${fLeadId} (${sendMode}, provider=${fuProvider.name})`);
        } catch (itemErr: any) {
          console.error(`[${OUTREACH_STAMP}] Error processing followup ${fId}:`, itemErr?.message);
          // Phase 4.5: Clear processing lock so it can be retried next cron
          try {
            await db.prepare("UPDATE outreach_followups SET processing_at = NULL WHERE id = ?").bind(fId).run();
          } catch { /* ignore cleanup error */ }
        }
      }
    } catch (cronErr: any) {
      console.error(`[${OUTREACH_STAMP}] Cron error:`, cronErr?.message);
    }
  }

  // ── AI followup (D1 が必要) ────────────────────────────────────────────────
  if (db) {
    const STAMP = "AI_FOLLOWUP_CRON_V1";
    try {
      const now = new Date().toISOString();
      const { results } = await db.prepare(
        `SELECT id, tenant_id, line_user_id, customer_name, slot_start
         FROM reservations
         WHERE followup_status = 'pending'
           AND followup_at IS NOT NULL
           AND followup_at <= ?
         LIMIT 50`
      ).bind(now).all();

      if (results && results.length > 0) {
        for (const row of results) {
          const { id, tenant_id: tId, line_user_id: lineUserId, customer_name: custName, slot_start: slotStart } = row as any;

          // No LINE user → skip
          if (!lineUserId) {
            await db.prepare(`UPDATE reservations SET followup_status = 'skipped', followup_sent_at = ? WHERE id = ?`)
              .bind(now, id).run().catch(() => null);
            continue;
          }

          // Fetch channelAccessToken from KV settings
          let channelAccessToken: string | null = null;
          try {
            const settingsRaw = await kv.get(`settings:${tId}`);
            if (settingsRaw) {
              const s = JSON.parse(settingsRaw);
              channelAccessToken = s?.integrations?.line?.channelAccessToken ?? null;
            }
          } catch { /* ignore */ }

          if (!channelAccessToken) {
            await db.prepare(`UPDATE reservations SET followup_status = 'skipped', followup_sent_at = ?, followup_error = ? WHERE id = ?`)
              .bind(now, "no_channel_token", id).run().catch(() => null);
            continue;
          }

          // Fetch retention template
          let template = "{{customerName}}様、先日はご来店ありがとうございました！またのご来店をお待ちしております。";
          try {
            const ret = await aiGetJson(kv, `ai:retention:${tId}`);
            if (ret?.enabled && ret?.followupTemplate) template = String(ret.followupTemplate);
          } catch { /* ignore */ }

          // Build message
          const visitDate = slotStart ? new Date(slotStart).toLocaleDateString("ja-JP") : "";
          const msg = template
            .replace("{{customerName}}", custName || "お客様")
            .replace("{{visitDate}}", visitDate);

          // Send LINE push
          try {
            const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${channelAccessToken}`,
              },
              body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: msg }] }),
            });
            if (lineRes.ok) {
              await db.prepare(`UPDATE reservations SET followup_status = 'sent', followup_sent_at = ? WHERE id = ?`)
                .bind(now, id).run().catch(() => null);
            } else {
              const errText = await lineRes.text().catch(() => `HTTP ${lineRes.status}`);
              await db.prepare(`UPDATE reservations SET followup_status = 'failed', followup_sent_at = ?, followup_error = ? WHERE id = ?`)
                .bind(now, errText.slice(0, 200), id).run().catch(() => null);
            }
          } catch (sendErr: any) {
            await db.prepare(`UPDATE reservations SET followup_status = 'failed', followup_sent_at = ?, followup_error = ? WHERE id = ?`)
              .bind(now, String(sendErr?.message ?? sendErr).slice(0, 200), id).run().catch(() => null);
          }
        }
      }
    } catch (e: any) {
      console.error(`[${STAMP}] error:`, String(e?.message ?? e));
    }
  }

  // ── pushq consumer: push 失敗リトライ (KV のみ・token 不保持設計) ──────────
  // key: ai:pushq:{tenantId}:{id}  → channelAccessToken は settings KV から再取得
  const PUSHQ_STAMP = "PUSHQ_CONSUMER_V1";
  try {
    const { keys } = await kv.list({ prefix: "ai:pushq:", limit: 50 });
    if (keys && keys.length > 0) {
      console.log(`[${PUSHQ_STAMP}] processing ${keys.length} items`);
      for (const { name: qKey } of keys) {
        try {
          const raw = await kv.get(qKey);
          if (!raw) continue; // already expired/deleted

          const item = JSON.parse(raw) as { tenantId: string; userId: string; messages: any[] };
          const { tenantId: tId, userId, messages } = item;
          if (!tId || !userId || !Array.isArray(messages)) {
            await kv.delete(qKey);
            continue;
          }

          // channelAccessToken を settings KV から再取得（token は pushq に保存しない）
          let channelAccessToken: string | null = null;
          try {
            const settingsRaw = await kv.get(`settings:${tId}`);
            if (settingsRaw) {
              const s = JSON.parse(settingsRaw);
              channelAccessToken = s?.integrations?.line?.channelAccessToken ?? null;
            }
          } catch { /* ignore */ }

          if (!channelAccessToken) {
            // token が消えた場合はリトライ不可 → 破棄
            console.log(`[${PUSHQ_STAMP}] discard key=...${qKey.slice(-12)} reason=no_token`);
            await kv.delete(qKey);
            continue;
          }

          const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${channelAccessToken}`,
            },
            body: JSON.stringify({ to: userId, messages }),
          });
          const pushBody = await pushRes.text().catch(() => "");

          // uid/token は先頭6文字のみログ
          console.log(
            `[${PUSHQ_STAMP}] tenant=${tId} uid=${userId.slice(0, 6)}*** ` +
            `st=${pushRes.status} ok=${pushRes.ok} body=${pushBody.slice(0, 80)}`
          );

          if (pushRes.ok) {
            await kv.delete(qKey); // 成功 → キューから削除
          }
          // 失敗時は TTL 切れまで残す（次の cron で再試行）
        } catch (itemErr: any) {
          console.error(`[${PUSHQ_STAMP}] item error:`, String(itemErr?.message ?? itemErr));
        }
      }
    }
  } catch (pushqErr: any) {
    console.error(`[${PUSHQ_STAMP}] list error:`, String(pushqErr?.message ?? pushqErr));
  }

  // ── Phase 7: Learning Auto Refresh (every 24h per tenant) ──────────────
  if (db) {
    const LEARN_STAMP = "LEARNING_AUTO_REFRESH_V1";
    try {
      // Only run at JST midnight-ish (hour 0-1) to minimize cron load
      const learnNowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
      const learnHour = learnNowJst.getHours();
      if (learnHour >= 0 && learnHour <= 1) {
        const { autoRefreshAllTenants } = await import("../outreach/learning");
        const learnUid = () => `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const learnNow = () => new Date().toISOString();
        const result = await autoRefreshAllTenants(db, learnUid, learnNow);
        if (result.tenantsProcessed > 0) {
          console.log(`[${LEARN_STAMP}] Processed ${result.tenantsProcessed} tenants, ${result.totalUpdated} patterns, ${result.totalTemplates} templates`);
        }
      }
    } catch (learnErr: any) {
      console.error(`[${LEARN_STAMP}] error:`, String(learnErr?.message ?? learnErr));
    }
  }

  // ── Phase 8.2: Source Quality Daily Aggregation (JST midnight) ──────────
  if (db) {
    const SQD_STAMP = "SOURCE_QUALITY_DAILY_V1";
    try {
      const sqdNowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
      const sqdHour = sqdNowJst.getHours();
      // Run at JST 1-2 AM (after learning refresh at 0-1)
      if (sqdHour >= 1 && sqdHour <= 2) {
        const { aggregateSourceQualityDaily } = await import("../outreach/source-quality-daily");
        const sqdUid = () => `sqd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const sqdNow = () => new Date().toISOString();
        const result = await aggregateSourceQualityDaily(db, sqdUid, sqdNow);
        if (result.rowsUpserted > 0) {
          console.log(`[${SQD_STAMP}] ${result.tenantsProcessed} tenants, ${result.rowsUpserted} rows upserted`);
        }
      }
    } catch (sqdErr: any) {
      console.error(`[${SQD_STAMP}] error:`, String(sqdErr?.message ?? sqdErr));
    }
  }

  // ── Phase 11: Auto Outreach Scheduler (runs at configured times) ────────
  if (db) {
    const SCHED_STAMP = "OUTREACH_SCHEDULER_V1";
    try {
      const { processScheduledJobs } = await import("../outreach/automation");
      const schedUid = () => `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const schedNow = () => new Date().toISOString();
      const schedResult = await processScheduledJobs(db, kv, schedUid, schedNow, {
        GOOGLE_MAPS_API_KEY: (env as any).GOOGLE_MAPS_API_KEY,
        OPENAI_API_KEY: (env as any).OPENAI_API_KEY,
        RESEND_API_KEY: (env as any).RESEND_API_KEY,
        EMAIL_FROM: (env as any).EMAIL_FROM,
      });
      if (schedResult.processed > 0 || schedResult.errors > 0) {
        console.log(`[${SCHED_STAMP}] processed=${schedResult.processed} errors=${schedResult.errors}`);
      }
    } catch (schedErr: any) {
      console.error(`[${SCHED_STAMP}] error:`, String(schedErr?.message ?? schedErr));
    }
  }

  // ── Phase 13: Auto Action Engine (cron) ────────────────────────────────
  if (db) {
    const AAE_STAMP = "AUTO_ACTION_ENGINE_V1";
    try {
      const { processAutoActions } = await import("../outreach/action-engine");
      const aaeUid = () => `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const aaeNow = () => new Date().toISOString();
      const aaeResult = await processAutoActions(db, kv, aaeUid, aaeNow, {
        GOOGLE_MAPS_API_KEY: (env as any).GOOGLE_MAPS_API_KEY,
        OPENAI_API_KEY: (env as any).OPENAI_API_KEY,
      });
      if (aaeResult.processed > 0 || aaeResult.errors > 0) {
        console.log(`[${AAE_STAMP}] processed=${aaeResult.processed} skipped=${aaeResult.skipped} errors=${aaeResult.errors}`);
      }
    } catch (aaeErr: any) {
      console.error(`[${AAE_STAMP}] error:`, String(aaeErr?.message ?? aaeErr));
    }
  }

  // ── Phase 14: Auto Reply Engine (cron) ────────────────────────────────
  if (db) {
    const ARE_STAMP = "AUTO_REPLY_ENGINE_V1";
    try {
      const { processUnhandledReplies, getAutoReplySettings } = await import("../outreach/reply-dispatcher");
      const areUid = () => `ol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const areNow = () => new Date().toISOString();

      // Process all tenants that have unhandled replies
      const tenantRows = await db
        .prepare("SELECT DISTINCT tenant_id FROM outreach_replies WHERE ai_handled = 0 LIMIT 20")
        .all<{ tenant_id: string }>();

      for (const row of tenantRows.results ?? []) {
        const tid = row.tenant_id;
        const arSettings = await getAutoReplySettings(kv, tid);
        if (!arSettings.autoReplyEnabled) continue;

        const areResult = await processUnhandledReplies({
          db, kv, tenantId: tid,
          openaiApiKey: (env as any).OPENAI_API_KEY,
          resendApiKey: (env as any).RESEND_API_KEY,
          emailFrom: (env as any).EMAIL_FROM,
          uid: areUid, now: areNow,
        });
        if (areResult.processed > 0 || areResult.errors > 0) {
          console.log(`[${ARE_STAMP}] tenant=${tid} processed=${areResult.processed} sent=${areResult.sent} skipped=${areResult.skipped} errors=${areResult.errors}`);
        }
      }
    } catch (areErr: any) {
      console.error(`[AUTO_REPLY_ENGINE_V1] error:`, String(areErr?.message ?? areErr));
    }
  }

  // ── Phase 15: Auto Close Engine (cron) ────────────────────────────────
  if (db) {
    const ACE_STAMP = "AUTO_CLOSE_ENGINE_V1";
    try {
      const { classifyCloseIntent } = await import("../outreach/close-classifier");
      const { getCloseSettings, generateCloseResponse } = await import("../outreach/close-generator");
      const { CLOSE_INTENT_TO_STAGE } = await import("../outreach/types");
      const aceUid = () => `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const aceNow = () => new Date().toISOString();

      // Find tenants with replies that have been classified (intent set) but not close-evaluated
      const tenantRows = await db
        .prepare(
          `SELECT DISTINCT tenant_id FROM outreach_replies
           WHERE intent IS NOT NULL AND close_intent IS NULL
           LIMIT 20`
        )
        .all<{ tenant_id: string }>();

      for (const row of tenantRows.results ?? []) {
        const tid = row.tenant_id;
        const closeSettings = await getCloseSettings(kv, tid);
        if (!closeSettings.auto_close_enabled) continue;

        // Get unprocessed replies (classified by Phase 14 but not close-evaluated)
        const replies = await db
          .prepare(
            `SELECT id, lead_id, reply_text, intent, close_intent
             FROM outreach_replies
             WHERE tenant_id = ?1 AND intent IS NOT NULL AND close_intent IS NULL
             ORDER BY created_at ASC LIMIT 10`
          )
          .bind(tid)
          .all();

        let evaluated = 0;
        for (const reply of replies.results ?? []) {
          try {
            const result = await classifyCloseIntent(
              reply.reply_text as string,
              (env as any).OPENAI_API_KEY
            );

            // Update reply
            await db
              .prepare(
                `UPDATE outreach_replies
                 SET close_intent = ?1, close_confidence = ?2, recommended_next_step = ?3,
                     deal_temperature = ?4, handoff_required = ?5
                 WHERE id = ?6 AND tenant_id = ?7`
              )
              .bind(
                result.close_intent, result.close_confidence, result.recommended_next_step,
                result.deal_temperature, result.recommended_next_step === "human_followup" ? 1 : 0,
                reply.id, tid
              )
              .run();

            // Update lead
            const closeStage = CLOSE_INTENT_TO_STAGE[result.close_intent] || null;
            await db
              .prepare(
                `UPDATE sales_leads
                 SET deal_temperature = ?1, handoff_required = ?2, close_stage = ?3, close_evaluated_at = ?4, updated_at = ?5
                 WHERE id = ?6 AND tenant_id = ?7`
              )
              .bind(
                result.deal_temperature,
                result.recommended_next_step === "human_followup" ? 1 : 0,
                closeStage, aceNow(), aceNow(),
                reply.lead_id, tid
              )
              .run();

            // Close log
            await db
              .prepare(
                `INSERT INTO outreach_close_logs
                 (id, tenant_id, lead_id, reply_id, close_intent, close_confidence, deal_temperature,
                  suggested_action, execution_status, handoff_required, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
              )
              .bind(
                aceUid(), tid, reply.lead_id, reply.id,
                result.close_intent, result.close_confidence, result.deal_temperature,
                result.recommended_next_step,
                "suggested",
                result.recommended_next_step === "human_followup" ? 1 : 0,
                aceNow()
              )
              .run();

            evaluated++;

            // Auto-send close response if enabled and confidence is high enough
            if (
              closeSettings.auto_close_enabled &&
              result.close_confidence >= closeSettings.close_confidence_threshold &&
              result.close_intent !== "not_close_relevant" &&
              result.close_intent !== "cold_lead" &&
              result.recommended_next_step !== "human_followup" &&
              result.recommended_next_step !== "mark_lost"
            ) {
              const lead = await db
                .prepare("SELECT store_name FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
                .bind(reply.lead_id as string, tid)
                .first<{ store_name: string }>();

              // Phase 18: Inject learning context into close response
              let closeLearningCtx = null;
              try {
                const { getLearningContext } = await import("../outreach/learning");
                closeLearningCtx = await getLearningContext(db, tid);
              } catch { /* learning optional */ }

              const closeResp = await generateCloseResponse({
                closeIntent: result.close_intent,
                dealTemperature: result.deal_temperature,
                recommendedNextStep: result.recommended_next_step,
                replyText: reply.reply_text as string,
                storeName: lead?.store_name || "弊社",
                settings: closeSettings,
                openaiApiKey: (env as any).OPENAI_API_KEY,
                learningContext: closeLearningCtx,
              });

              // Log the auto-generated response (but don't auto-send unless specific settings are on)
              const shouldAutoSend =
                (result.recommended_next_step === "send_pricing" && closeSettings.auto_send_pricing_enabled) ||
                (result.recommended_next_step === "send_demo_link" && closeSettings.auto_send_demo_link_enabled) ||
                (result.recommended_next_step === "send_booking_link" && closeSettings.auto_send_booking_link_enabled);

              // Actually send if auto-send is enabled for this action
              let closeSent = false;
              let closeError: string | null = null;
              if (shouldAutoSend) {
                try {
                  const { resolveProvider: resolveCloseProvider } = await import("../outreach/send-provider");
                  let closeSendMode: "safe" | "real" = "safe";
                  try {
                    const osRaw = await kv.get(`outreach:settings:${tid}`);
                    if (osRaw) closeSendMode = JSON.parse(osRaw).sendMode ?? "safe";
                  } catch { /* default safe */ }
                  const closeProvider = resolveCloseProvider(closeSendMode, {
                    RESEND_API_KEY: (env as any).RESEND_API_KEY,
                    EMAIL_FROM: (env as any).EMAIL_FROM,
                  });
                  const leadContact = await db
                    .prepare("SELECT contact_email FROM sales_leads WHERE id = ?1 AND tenant_id = ?2")
                    .bind(reply.lead_id, tid)
                    .first<{ contact_email: string | null }>();
                  if (leadContact?.contact_email) {
                    const closeSendResult = await closeProvider.send({
                      leadId: reply.lead_id as string,
                      tenantId: tid,
                      channel: "email",
                      to: leadContact.contact_email,
                      subject: "Re: お問い合わせありがとうございます",
                      body: closeResp.response_text,
                    });
                    closeSent = closeSendResult.success;
                    if (!closeSendResult.success) closeError = closeSendResult.error || "close_send_failed";
                  } else {
                    closeError = "no_contact_email";
                  }
                } catch (sendErr: any) {
                  closeError = sendErr.message || "close_dispatch_error";
                }
              }

              await db
                .prepare(
                  `INSERT INTO outreach_close_logs
                   (id, tenant_id, lead_id, reply_id, close_intent, close_confidence, deal_temperature,
                    suggested_action, ai_response, execution_status, handoff_required, created_at)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
                )
                .bind(
                  aceUid(), tid, reply.lead_id, reply.id,
                  result.close_intent, result.close_confidence, result.deal_temperature,
                  result.recommended_next_step, closeResp.response_text,
                  shouldAutoSend ? (closeSent ? "auto_sent" : `failed:${closeError}`) : "pending_review",
                  closeResp.handoff_required ? 1 : 0,
                  aceNow()
                )
                .run();

              // Phase 18: Track booking event if a link was sent
              if (closeSent && (result.recommended_next_step === "send_booking_link" || result.recommended_next_step === "send_demo_link" || result.recommended_next_step === "send_pricing")) {
                try {
                  await db.prepare(
                    `INSERT INTO outreach_booking_events
                     (id, tenant_id, lead_id, event_type, created_at)
                     VALUES (?1, ?2, ?3, 'link_sent', ?4)`
                  ).bind(aceUid(), tid, reply.lead_id, aceNow()).run();
                } catch { /* booking event tracking is best-effort */ }
              }

              // Phase 18: Auto-handoff for escalations
              if (closeResp.handoff_required) {
                try {
                  await db.prepare(
                    `INSERT INTO outreach_handoffs
                     (id, tenant_id, lead_id, reply_id, reason, priority, status, created_at)
                     VALUES (?1, ?2, ?3, ?4, 'escalation', ?5, 'open', ?6)`
                  ).bind(
                    aceUid(), tid, reply.lead_id, reply.id,
                    result.deal_temperature === "hot" ? "urgent" : "high",
                    aceNow()
                  ).run();
                } catch { /* handoff creation is best-effort */ }
              }
            }
          } catch (innerErr: any) {
            console.error(`[${ACE_STAMP}] reply ${reply.id} error:`, innerErr.message);
          }
        }

        if (evaluated > 0) {
          console.log(`[${ACE_STAMP}] tenant=${tid} evaluated=${evaluated}`);
        }
      }
    } catch (aceErr: any) {
      console.error(`[AUTO_CLOSE_ENGINE_V1] error:`, String(aceErr?.message ?? aceErr));
    }
  }

  // ── Phase 17: Auto Campaign Runner (cron) ────────────────────────────
  if (db) {
    const ACR_STAMP = "AUTO_CAMPAIGN_RUNNER_V1";
    try {
      const { runAutoCampaign } = await import("../outreach/automation");
      const acrUid = () => `ac_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const acrNow = () => new Date().toISOString();

      // Find tenants with autoCampaignEnabled
      // Use a simple heuristic: check tenants that have new leads with scores
      const tenantRows = await db
        .prepare(
          `SELECT DISTINCT tenant_id FROM sales_leads
           WHERE pipeline_stage = 'new' AND contact_email IS NOT NULL AND score >= 60
           LIMIT 20`
        )
        .all<{ tenant_id: string }>();

      const { writeHealthSnapshot, checkAndAutoPause } = await import("../outreach/monitoring");

      for (const row of tenantRows.results ?? []) {
        const tid = row.tenant_id;

        // Phase 18: Auto-pause check before processing
        const wasPaused = await checkAndAutoPause(db, kv, tid);
        if (wasPaused) {
          console.log(`[${ACR_STAMP}] tenant=${tid} auto-paused, skipping`);
          continue;
        }

        const acrResult = await runAutoCampaign(db, kv, tid, acrUid, acrNow, {
          OPENAI_API_KEY: (env as any).OPENAI_API_KEY,
          RESEND_API_KEY: (env as any).RESEND_API_KEY,
          EMAIL_FROM: (env as any).EMAIL_FROM,
        });
        if (acrResult.processed > 0 || acrResult.errors > 0) {
          console.log(`[${ACR_STAMP}] tenant=${tid} processed=${acrResult.processed} drafted=${acrResult.drafted} sent=${acrResult.sent} skipped=${acrResult.skipped} errors=${acrResult.errors}`);
        }

        // Phase 18: Write health snapshot
        try {
          await writeHealthSnapshot(db, tid, "AUTO_CAMPAIGN", acrResult.sent, acrResult.errors, acrUid, acrNow);
        } catch { /* monitoring is best-effort */ }
      }
    } catch (acrErr: any) {
      console.error(`[${ACR_STAMP}] error:`, String(acrErr?.message ?? acrErr));
    }
  }

  // ── LINE 1日前リマインド ────────────────────────────────────────────────────
  if (db) {
    const REM_STAMP = "LINE_REMINDER_V1";
    const DRY_RUN = String((env as any).REMINDER_DRY_RUN ?? "").trim() === "1";
    try {
      // 現在の JST 時刻
      const nowJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
      const nowHour = nowJst.getHours();

      // 翌日の日付（JST）を YYYY-MM-DD 形式で取得
      const tomorrow = new Date(nowJst);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // "YYYY-MM-DD"

      // 翌日の予約を取得（LINE ユーザー ID が登録済みのもの）
      const { results: remRows } = await db.prepare(
        `SELECT r.id, r.tenant_id, r.line_user_id, r.customer_name, r.slot_start,
                r.staff_id, r.meta
         FROM reservations r
         WHERE r.${SQL_ACTIVE_FILTER}
           AND r.line_user_id IS NOT NULL
           AND r.line_user_id != ''
           AND substr(r.slot_start, 1, 10) = ?
         LIMIT 100`
      ).bind(tomorrowStr).all();

      if (!remRows || remRows.length === 0) {
        console.log(`[${REM_STAMP}] no rows for tomorrow=${tomorrowStr} hour=${nowHour}`);
      } else {
        // テナント別にグルーピング
        const byTenant = new Map<string, typeof remRows>();
        for (const row of remRows) {
          const tid = String((row as any).tenant_id ?? "");
          if (!tid) continue;
          if (!byTenant.has(tid)) byTenant.set(tid, []);
          byTenant.get(tid)!.push(row);
        }

        for (const [tId, rows] of byTenant) {
          // テナント設定を KV から取得
          let settings: any = {};
          try {
            const raw = await kv.get(`settings:${tId}`);
            if (raw) settings = JSON.parse(raw);
          } catch { /* ignore */ }

          const reminderCfg = settings?.notifications?.lineReminder;
          if (!reminderCfg?.enabled) {
            console.log(`[${REM_STAMP}] tenant=${tId} reminder disabled → skip`);
            continue;
          }

          const sendAtHour: number = typeof reminderCfg.sendAtHour === "number" ? reminderCfg.sendAtHour : 18;
          if (nowHour !== sendAtHour) {
            // 指定時刻と JST 時刻が一致しない → スキップ
            continue;
          }

          const accessToken = String(settings?.integrations?.line?.channelAccessToken ?? "").trim();
          if (!accessToken) {
            console.log(`[${REM_STAMP}] tenant=${tId} no channelAccessToken → skip`);
            continue;
          }

          const storeName = String(settings?.storeName ?? "").trim();
          const storeAddress = String(settings?.storeAddress ?? "").trim();

          // スタッフ一覧を KV から取得（staffName 解決用）
          let staffMap: Record<string, string> = {};
          try {
            const staffRaw = await kv.get(`admin:staff:list:${tId}`);
            if (staffRaw) {
              const list: any[] = JSON.parse(staffRaw);
              for (const s of list) {
                if (s?.id && s?.name) staffMap[String(s.id)] = String(s.name);
              }
            }
          } catch { /* ignore */ }

          // メニュー一覧を KV から取得（menuName 解決用）
          let menuMap: Record<string, string> = {};
          try {
            const menuRaw = await kv.get(`admin:menu:list:${tId}`);
            if (menuRaw) {
              const list: any[] = JSON.parse(menuRaw);
              for (const m of list) {
                if (m?.id && m?.name) menuMap[String(m.id)] = String(m.name);
              }
            }
          } catch { /* ignore */ }

          const templateStr = String(reminderCfg.template ?? "").trim() ||
            "【{storeName}】明日 {date} {time} のご予約があります。";

          const nowIso = new Date().toISOString();

          for (const row of rows) {
            const resId = String((row as any).id ?? "");
            const lineUserId = String((row as any).line_user_id ?? "");
            const slotStart = String((row as any).slot_start ?? "");
            const staffId = String((row as any).staff_id ?? "");

            // 予約日時を JST に変換
            let dateStr = "";
            let timeStr = "";
            try {
              const d = new Date(slotStart);
              dateStr = d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
              timeStr = d.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
            } catch { /* ignore */ }

            // meta から menuId を取得
            let menuName = "";
            try {
              const meta = (row as any).meta ? JSON.parse(String((row as any).meta)) : {};
              const menuId = String(meta?.menuId ?? "");
              menuName = menuId ? (menuMap[menuId] ?? "") : (String(meta?.menuName ?? ""));
            } catch { /* ignore */ }

            const staffName = staffId ? (staffMap[staffId] ?? "") : "";

            // 管理 URL（Workers は origin を知らないので settings から bookingUrl ベースを作る）
            const bookingUrl = String(settings?.integrations?.line?.bookingUrl ?? "").trim();
            const manageUrl = bookingUrl
              ? bookingUrl.replace(/\/booking(\?.*)?$/, `/booking/reservations?tenantId=${encodeURIComponent(tId)}`)
              : "";

            // テンプレート変数を置換
            const msg = templateStr
              .replace(/\{storeName\}/g, storeName)
              .replace(/\{date\}/g, dateStr)
              .replace(/\{time\}/g, timeStr)
              .replace(/\{menuName\}/g, menuName)
              .replace(/\{staffName\}/g, staffName)
              .replace(/\{address\}/g, storeAddress)
              .replace(/\{manageUrl\}/g, manageUrl);

            if (DRY_RUN) {
              // ドライラン：DB に dry_run として記録のみ（LINE 送信なし）
              try {
                await db.prepare(
                  `INSERT OR IGNORE INTO reminder_logs (tenant_id, reservation_id, kind, sent_at, status)
                   VALUES (?, ?, 'day_before', ?, 'dry_run')`
                ).bind(tId, resId, nowIso).run();
              } catch { /* ignore duplicate */ }
              console.log(`[${REM_STAMP}] DRY_RUN tenant=${tId} res=${resId} to=${lineUserId.slice(0, 6)}***`);
              continue;
            }

            // 重複防止: reminder_logs に INSERT（UNIQUE 制約違反 = 送信済み → スキップ）
            let inserted = false;
            try {
              const ins = await db.prepare(
                `INSERT OR IGNORE INTO reminder_logs (tenant_id, reservation_id, kind, sent_at, status)
                 VALUES (?, ?, 'day_before', ?, 'pending')`
              ).bind(tId, resId, nowIso).run();
              inserted = (ins?.meta?.changes ?? 0) > 0;
            } catch { /* ignore */ }

            if (!inserted) {
              console.log(`[${REM_STAMP}] skip(dup) tenant=${tId} res=${resId}`);
              continue;
            }

            // LINE push 送信
            try {
              const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: msg }] }),
              });
              if (lineRes.ok) {
                await db.prepare(
                  `UPDATE reminder_logs SET status = 'sent' WHERE tenant_id = ? AND reservation_id = ? AND kind = 'day_before'`
                ).bind(tId, resId).run().catch(() => null);
                console.log(`[${REM_STAMP}] sent tenant=${tId} res=${resId} to=${lineUserId.slice(0, 6)}***`);
              } else {
                const errTxt = await lineRes.text().catch(() => `HTTP ${lineRes.status}`);
                await db.prepare(
                  `UPDATE reminder_logs SET status = 'failed', error = ? WHERE tenant_id = ? AND reservation_id = ? AND kind = 'day_before'`
                ).bind(errTxt.slice(0, 200), tId, resId).run().catch(() => null);
                console.log(`[${REM_STAMP}] failed tenant=${tId} res=${resId} err=${errTxt.slice(0, 80)}`);
              }
            } catch (sendErr: any) {
              await db.prepare(
                `UPDATE reminder_logs SET status = 'failed', error = ? WHERE tenant_id = ? AND reservation_id = ? AND kind = 'day_before'`
              ).bind(String(sendErr?.message ?? sendErr).slice(0, 200), tId, resId).run().catch(() => null);
            }
          }
        }
      }
    } catch (remErr: any) {
      console.error(`[${REM_STAMP}] error:`, String(remErr?.message ?? remErr));
    }
  }

  // ── Agent Core Scheduler ─────────────────────────────────────────────────
  // Process all due scheduled agents across tenants
  try {
    const agentResult = await runAllDueAgents(env as any);
    if (agentResult.totalProcessed > 0) {
      console.log(`[AGENT_SCHEDULER] tenants=${agentResult.tenants} processed=${agentResult.totalProcessed}`);
    }
  } catch (agentErr: any) {
    console.error("[AGENT_SCHEDULER] error:", String(agentErr?.message ?? agentErr));
  }

  // ── Instagram Marketing Cron Jobs ────────────────────────────────────────
  // Runs every 5 min (same as main cron). Each handler checks timing internally.
  //
  // wrangler.toml [triggers] crons already has "*/5 * * * *" for production.
  // If finer scheduling is needed, add these cron expressions:
  //   "0 * * * *"      — hourly: post queue check
  //   "0 3 * * *"      — daily 3am: fetch insights
  //   "0 4 * * *"      — daily 4am: token refresh
  //   "0 8 * * 1"      — weekly Monday 8am: A/B test aggregation

  const nowHour = new Date().getUTCHours();
  const nowMinute = new Date().getUTCMinutes();
  const nowDay = new Date().getUTCDay(); // 0=Sun, 1=Mon

  // Every run (every 5 min): check queue for posts due
  try {
    await cronPostQueue(env);
  } catch (e: any) {
    console.error("[IG_POST_CRON] error:", String(e?.message ?? e));
  }

  // Daily at ~3:00 UTC: fetch insights for yesterday's posts
  if (nowHour === 3 && nowMinute < 5) {
    try {
      await cronFetchInsights(env);
    } catch (e: any) {
      console.error("[IG_INSIGHTS_CRON] error:", String(e?.message ?? e));
    }
  }

  // Daily at ~4:00 UTC: refresh expiring tokens
  if (nowHour === 4 && nowMinute < 5) {
    try {
      await cronRefreshTokens(env);
    } catch (e: any) {
      console.error("[IG_TOKEN_CRON] error:", String(e?.message ?? e));
    }
  }

  // Weekly Monday ~8:00 UTC: A/B test aggregation
  if (nowDay === 1 && nowHour === 8 && nowMinute < 5) {
    try {
      await cronABTestAggregation(env);
    } catch (e: any) {
      console.error("[IG_ABTEST_CRON] error:", String(e?.message ?? e));
    }
  }
}
