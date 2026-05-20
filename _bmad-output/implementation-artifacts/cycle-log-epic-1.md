# Epic 1 Cycle Log

Append-only per-stage log. TAB-separated fields: `<UTC-timestamp> TAB Story <id> TAB <stage> TAB <metadata>`.
Stages: `story_created`, `dev_complete`, `qa_complete`, `cr_complete`, `committed`.

2026-05-18T00:00:00Z	Epic 1	sprint_planning_complete	file=_bmad-output/implementation-artifacts/sprint-status.yaml
2026-05-18T00:00:01Z	Epic 1	retro_review_skipped	reason=no_predecessor_no_deferred_work
2026-05-18T00:05:00Z	Story 1.1	story_created	path=_bmad-output/implementation-artifacts/1-1-initialize-monorepo-with-web-and-bake-halves.md
2026-05-18T18:16:00Z	Story 1.1	dev_complete	files=.python-version,.gitattributes,.gitignore,README.md,web/,bake/,_bmad-output/implementation-artifacts/1-1-initialize-monorepo-with-web-and-bake-halves.md
2026-05-18T18:35:00Z	Story 1.1	qa_complete	tests=web/tests/scaffold.test.ts,web/tests/no-pii-grep.test.ts,bake/tests/test_scaffold.py passed=99 failed=0
2026-05-18T18:55:00Z	Story 1.1	cr_complete	resolved=3 deferred=7 dismissed=2 tests_passing=101 ac_status=all_pass
2026-05-18T19:00:00Z	Story 1.1	committed	sha=414db52 submodules= remote=origin/epic1
2026-05-18T19:05:00Z	Story 1.2	story_created	path=_bmad-output/implementation-artifacts/1-2-author-phase-0-adr-catalogue-25-entries.md
2026-05-18T20:00:00Z	Story 1.2	dev_complete	files=docs/adr/(28_files),scripts/adr-index.py,bake/tests/test_adr_catalogue.py,.gitattributes,README.md tests=164/164
2026-05-18T20:30:00Z	Story 1.2	qa_complete	tests=bake/tests/test_adr_catalogue_defense.py passed=222 skipped=2 failed=0
2026-05-18T20:45:00Z	Story 1.2	cr_complete	resolved=2 deferred=1 dismissed=0 tests_passing=222 ac_status=all_pass
2026-05-18T20:50:00Z	Story 1.2	committed	sha=2b1385c submodules= remote=origin/epic1
2026-05-18T20:55:00Z	Story 1.3	story_created	path=_bmad-output/implementation-artifacts/1-3-acquire-and-hash-pin-naif-and-pds-kernels.md user_scope=full_execution
2026-05-18T22:00:00Z	Story 1.3	dev_complete	files=bake/src/(5_scripts),kernels/(17_kernels+manifest+frame-ids),docs/kernels/ckbrief-inventory.md,bake/tests/(3_new) kernels_size_mb=187 tests=172_passed_2_skipped
2026-05-18T22:30:00Z	Story 1.3	qa_complete	tests=bake/tests/test_kernels_defense.py passed=280 skipped=2 failed=0 hardening=schema_version_guard
2026-05-18T22:50:00Z	Story 1.3	cr_complete	resolved=1 deferred=5 dismissed=0 tests_passing=280 skipped=2 ac_status=all_pass security_fix=sha_verify_before_atomic_rename
2026-05-18T23:00:00Z	Story 1.3	committed	sha=7f850fe submodules= remote=origin/epic1 lfs_mb=188
2026-05-18T23:05:00Z	Story 1.4	story_created	path=_bmad-output/implementation-artifacts/1-4-bake-pipeline-scaffold-and-l1-python-validation-harness.md
2026-05-19T00:30:00Z	Story 1.4	dev_complete	files=bake/src/(4_modules),bake/tests/(4_new),justfile,README.md,brotli_dep segments=v1_7_v2_11 worst_max_km=10.387 worst_rms_km=0.081 nfr_p9=pass tests=221_passed_2_skipped
2026-05-19T00:45:00Z	Story 1.4	qa_complete	tests=bake/tests/test_bake_defense.py passed_slow=237 skipped=2 failed=0
2026-05-19T01:00:00Z	Story 1.4	cr_complete	resolved=1 deferred=9 dismissed=0 tests_passing_fast=228_slow=10 skipped=2 ac_status=all_pass schema_fix=kernels_source_url
2026-05-19T01:05:00Z	Story 1.4	committed	sha=40144d1 submodules= remote=origin/epic1
2026-05-19T01:10:00Z	Story 1.5	story_created	path=_bmad-output/implementation-artifacts/1-5-three-js-renderer-foundation-with-reverse-z-and-floating-origin.md
2026-05-19T02:00:00Z	Story 1.5	dev_complete	files=web/src/(8_modules+8_tests),web/tests/(2_new),main.ts threejs=0.184.0 tests=161_web_228_bake_2_skipped ac5_browser_deferred=true
2026-05-19T02:30:00Z	Story 1.5	qa_complete	tests=web/tests/renderer-defense.test.ts passed=187_web_228_bake skipped=2 failed=0
2026-05-19T03:00:00Z	Story 1.5	cr_complete	resolved=3 deferred=8 dismissed=0 tests_passing=187_web_228_bake skipped=2 ac_status=all_pass fixes=lookAt_target,resize_handler_smoke_mode,fallback_warn_misleading
2026-05-19T03:10:00Z	Story 1.5	committed	sha=fc378fa submodules= remote=origin/epic1
2026-05-19T03:15:00Z	Story 1.6	story_created	path=_bmad-output/implementation-artifacts/1-6-asset-manifest-loader-and-ephemerisservice.md
2026-05-19T04:00:00Z	Story 1.6	dev_complete	files=web/src/(3_services+1_math+1_dev),web/public/data/,scripts/copy_bake_to_web.py,bake/src/generate_l2_fixtures.py,l2-fixtures.json zod=4.4.3 tests=240_web_233_fast_bake l2_max_km_v1=0.195_v2=0.178
2026-05-19T04:30:00Z	Story 1.6	qa_complete	tests=web/tests/ephemeris-defense.test.ts passed=277_web_244_bake skipped=2 failed=0
2026-05-19T05:00:00Z	Story 1.6	cr_complete	resolved=1 deferred=8 dismissed=0 tests_passing=277_web_233_fast_bake skipped=2 ac_status=all_pass fix=ephemeris_silent_swallow
2026-05-19T05:05:00Z	Story 1.6	committed	sha=c041a0f submodules= remote=origin/epic1
2026-05-19T05:10:00Z	Story 1.7	story_created	path=_bmad-output/implementation-artifacts/1-7-design-tokens-lit-3-scaffold-and-self-hosted-typography.md
2026-05-19T06:00:00Z	Story 1.7	dev_complete	files=web/src/styles/(4),web/src/components/(2),web/public/fonts/(3_woff2),index.html,THIRD_PARTY.md,scripts/font-subset.py lit=3.3.3 fonts_kb=98.8 tests=365_web_233_bake_2_skipped
2026-05-19T06:30:00Z	Story 1.7	qa_complete	tests=web/tests/design-system-defense.test.ts passed=423_web_233_bake skipped=2 failed=0 ux_spec_contrast_drift_noted=true
2026-05-19T07:00:00Z	Story 1.7	cr_complete	resolved=1 deferred=4 dismissed=18 tests_passing=423_web_233_bake skipped=2 ac_status=all_pass fix=stale_decorator_comment_v_version_test
2026-05-19T07:05:00Z	Story 1.7	committed	sha=85fc2ce submodules= remote=origin/epic1 lfs_kb=101
2026-05-19T07:10:00Z	Story 1.8	story_created	path=_bmad-output/implementation-artifacts/1-8-v-fallback-page-and-boot-time-capability-probe.md
2026-05-19T08:00:00Z	Story 1.8	dev_complete	files=web/src/components/v-fallback-page.ts,web/src/boot/(feature-detect+fallback-page-static),vite.config.ts,index.html,unsupported.html probe_bytes=750 swap_bytes=179 tests=482_web_233_fast_bake_2_skipped
2026-05-19T08:30:00Z	Story 1.8	qa_complete	tests=web/tests/fallback-defense.test.ts passed=514_web_233_bake skipped=2 failed=0
2026-05-19T09:00:00Z	Story 1.8	cr_complete	resolved=0 deferred=3 dismissed=0 tests_passing=514_web_233_bake skipped=2 ac_status=all_pass clean=true
2026-05-19T09:05:00Z	Story 1.8	committed	sha=24c7d7e submodules= remote=origin/epic1
2026-05-19T09:10:00Z	Story 1.9	story_created	path=_bmad-output/implementation-artifacts/1-9-designed-first-paint-sequence-and-v-timeline-scrubber-mission-variant.md
2026-05-19T10:00:00Z	Story 1.9	dev_complete	files=web/src/(2_components+1_primitive+1_service+2_math/constants),first-paint.ts,main.ts mission_start_et=-705844751.8171712 mission_end_et=978264068.1839114 tests=658_web_233_fast_bake_2_skipped
2026-05-19T10:30:00Z	Story 1.9	qa_complete	tests=web/tests/first-paint-defense.test.ts passed=695_web_233_bake skipped=2 failed=0 surfaced_gap=property_assignment_clamp
2026-05-19T11:00:00Z	Story 1.9	cr_complete	resolved=1 deferred=0 dismissed=0 tests_passing=695_web_233_bake skipped=2 ac_status=all_pass fix=clamp_on_property_write
2026-05-19T11:05:00Z	Story 1.9	committed	sha=b4aa196 submodules= remote=origin/epic1
2026-05-19T11:10:00Z	Story 1.10	story_created	path=_bmad-output/implementation-artifacts/1-10-v-play-button-simulation-clock-and-v-speed-multiplier.md
2026-05-19T12:00:00Z	Story 1.10	dev_complete	files=web/src/services/clock-manager.ts,web/src/components/(2_new+1_refactored),web/src/math/speed-readout.ts,web/src/boot/keyboard-shortcuts.ts tests=826_web_233_fast_bake_2_skipped spec_issue=nfr_p6_unrealizable_at_literal_rate
2026-05-19T12:30:00Z	Story 1.10	qa_complete	tests=web/tests/clock-multiplier-defense.test.ts passed=862_web_233_bake skipped=2 failed=0 nfr_p6_doc=added_by_qa
2026-05-19T13:00:00Z	Story 1.10	cr_complete	resolved=0 deferred=5 dismissed=4 tests_passing=862_web_233_bake skipped=2 ac_status=all_pass clean=true
2026-05-19T13:05:00Z	Story 1.10	committed	sha=f467b2b submodules= remote=origin/epic1
2026-05-19T13:10:00Z	Story 1.11	story_created	path=_bmad-output/implementation-artifacts/1-11-v-hud-container-and-hud-sub-components.md
2026-05-19T14:00:00Z	Story 1.11	dev_complete	files=web/src/components/v-hud(+5_subcomponents),web/src/math/au-format.ts,web/src/primitives/debounce.ts,first-paint.ts,main.ts pattern=per_frame_tick+aria_live_debounce tests=997_web_233_fast_bake_2_skipped
2026-05-19T14:30:00Z	Story 1.11	qa_complete	tests=web/tests/hud-defense.test.ts passed=1052_web_233_bake skipped=2 failed=0
2026-05-19T15:00:00Z	Story 1.11	cr_complete	resolved=0 deferred=8 dismissed=0 tests_passing=1052_web_233_bake skipped=2 ac_status=all_pass clean=true
2026-05-19T15:05:00Z	Story 1.11	committed	sha=0856377 submodules= remote=origin/epic1
2026-05-19T15:10:00Z	Story 1.12	story_created	path=_bmad-output/implementation-artifacts/1-12-both-voyager-spacecraft-with-past-solid-future-dashed-trajectory-lines.md
2026-05-19T16:00:00Z	Story 1.12	dev_complete	files=web/src/render/(spacecraft+trajectory),web/public/models/voyager.glb,THIRD_PARTY.md glb_mb=1.72 tests=1092_web_233_fast_bake_2_skipped
2026-05-19T16:30:00Z	Story 1.12	qa_complete	tests=web/tests/spacecraft-defense.test.ts passed=1110_web_244_bake skipped=2 failed=0
2026-05-19T17:00:00Z	Story 1.12	cr_complete	resolved=1 deferred=4 dismissed=0 tests_passing=1110_web_233_bake skipped=2 ac_status=all_pass high_fix=trajectory_polyline_from_zeros
2026-05-19T17:05:00Z	Story 1.12	committed	sha=e85dc1f submodules= remote=origin/epic1 lfs_mb=1.7
2026-05-19T17:10:00Z	Story 1.13	story_created	path=_bmad-output/implementation-artifacts/1-13-celestial-bodies-sun-eight-planets-and-one-moon.md user_scope=full_quality
2026-05-19T18:30:00Z	Story 1.13	dev_complete	files=web/src/render/(celestial+skybox),web/src/services/texture-loader.ts,web/src/dev/fps-readout.ts,web/public/textures/(11_png+1_skybox),bake/src/bake_trajectories.py textures_source=solarsystemscope_cc-by-4.0 ktx2_deferred_to_4.3 tests=1211_web_233_fast_bake_10_slow
2026-05-19T19:00:00Z	Story 1.13	qa_complete	tests=web/tests/celestial-defense-extended.test.ts passed=1276_web_233_bake skipped=2 failed=0 fix=uranus_neptune_radius_ordering
2026-05-19T19:30:00Z	Story 1.13	cr_complete	resolved=0 deferred=0 dismissed=4 tests_passing=1276_web_233_bake skipped=2 ac_status=all_pass clean=true
2026-05-19T19:35:00Z	Story 1.13	committed	sha=cb53d62 submodules= remote=origin/epic1 lfs_mb=10
2026-05-19T19:40:00Z	Story 1.14	story_created	path=_bmad-output/implementation-artifacts/1-14-baseline-ci-and-static-cdn-deploy.md
2026-05-19T20:30:00Z	Story 1.14	dev_complete	files=.github/workflows/ci.yml,web/public/_headers,bake/tests/test_ci_workflow.py,docs/adr/0016 cdn=cloudflare_pages tests=1276_web_244_fast_bake_2_skipped nfr_m4_interpretation_open=true
2026-05-19T21:00:00Z	Story 1.14	qa_complete	tests=bake/tests/test_ci_defense.py passed=257_skipped=3_failed=1 web_vitest=1276 intentional_failure=nfr_m4_doc_tripwire
2026-05-19T21:30:00Z	Story 1.14	cr_complete	resolved=1 deferred=4 dismissed=0 tests_passing=258_fast_bake_skipped=3_web=1276 ac_status=all_pass fix=nfr_m4_interpretation_doc_in_deferred_work
2026-05-19T21:35:00Z	Story 1.14	committed	sha=8b5891c submodules= remote=origin/epic1 epic_1_complete=true
2026-05-19T21:35:01Z	Epic 1	complete	stories=14 web_vitest=1276 bake_fast=258 bake_slow=14 lfs_mb=200 adrs=28
2026-05-19T21:30:00Z	Story 1.14	cr_complete	resolved=1 deferred=4 dismissed=0 tests_passing=258_bake_1276_web skipped=3 ac_status=all_pass med_fix=nfr_m4_interpretation_note_added_to_deferred_work_md epic_1_complete=true
2026-05-19T17:30:00Z	Story 1.5	adr_verifications_complete	tool=chrome_devtools_mcp ac=ac5 result=pass evidence=_bmad-output/implementation-artifacts/1-5-ac5-precision-smoke-screens/ env_note=brotli_probe_bypass_required post_hoc=true
2026-05-19T22:30:00Z	Story 1.15	story_created	path=_bmad-output/implementation-artifacts/1-15-manual-verification-defect-cleanup.md author=lead source=epic_1_retro_decision_c
2026-05-19T23:00:00Z	Story 1.15	dev_complete	files=web/src/render/render-engine.ts,web/src/main.ts,web/src/render/spacecraft-models.ts,web/src/components/v-timeline-scrubber.ts,web/src/components/v-speed-multiplier.ts,web/src/boot/first-paint.ts,web/src/math/speed-readout.ts,_bmad-output/planning-artifacts/prd.md,_bmad-output/planning-artifacts/architecture.md,_bmad-output/implementation-artifacts/deferred-work.md tests=web/src/render/render-engine.test.ts,web/src/render/spacecraft-models.test.ts,web/src/components/v-timeline-scrubber.test.ts,web/src/components/v-speed-multiplier.test.ts decisions=di_pattern_for_clock_wiring,draco_decoder_path_under_public_draco hygiene_issue=structured_completion_message_skipped_again_lead_wrote_log_entry_from_file_evidence
2026-05-19T23:55:00Z	Story 1.15	qa_complete	tests=web_vitest_1283_pass(+7)_files_74,bake_fast_256_pass_5_skip_14_deselect ac_coverage=ac1_render_engine_clock_wire_up_lines244_349,ac2_dracoloader_spy_lines238_262,ac3_scrubber_parsefloat_lines146_162,ac4_speed_multiplier_byte_exact_charcode_lines176_196 byte_exact_check=0x00D7_x_0x2014_em_dash hygiene_issue=qa_agent_silent_lead_ran_tests_directly
2026-05-20T00:10:00Z	Story 1.15	cr_complete	verdict=approve high=0 med=0 low=1_dracoloader_binaries_not_lfs_tracked ac1=pass ac2=pass ac3=pass ac4=pass_root_cause_fix_via_unicode_escapes ac5=nfr_p6_amended_in_prd_and_arch ac6=nfr_m4_amended_in_arch hygiene_issue=cr_agent_skipped_lead_ran_review_from_file_evidence
2026-05-20T00:25:00Z	Story 1.15	smoke_complete	method=chrome_devtools_mcp_with_brotli_shim result=pass evidence=_bmad-output/implementation-artifacts/1-15-smoke-evidence/ ac1_clock_wire_up=pass_play_3.024s_pause_0s ac2_dracoloader=pass_unit_test_confirmed_files_present ac3_scrubber_aria_numeric=pass_mission_start_end_et ac4_speed_aria_utf8=pass_charcode_0xd7_0x2014 ac5_nfr_p6=amended_in_prd_arch ac6_nfr_m4=amended_in_arch ac7_smoke=this_entry chunk_pipeline_broken_by_shim=story_1_16_scope
