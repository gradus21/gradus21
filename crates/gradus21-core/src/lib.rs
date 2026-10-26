pub mod crypto;
pub mod grading;
pub mod wasm;

#[cfg(test)]
mod tests {
    use super::crypto::*;
    use super::grading::*;
    use std::collections::HashMap;

    #[test]
    fn test_zero_knowledge_envelope_encryption_and_recovery() {
        let bundle = generate_vault_bundle("LehrkraftGeheim2026!").expect("vault bundle");
        assert_eq!(bundle.recovery_key_formatted.len(), 29);

        let unlocked = unlock_vault_with_password(
            "LehrkraftGeheim2026!",
            &bundle.kdf_salt_b64,
            &bundle.kdf_params,
            &bundle.encrypted_dek,
        )
        .expect("unlock with password");
        assert_eq!(unlocked.dek_b64, bundle.dek_b64);

        let recovered_dek = unlock_dek_with_recovery_key(
            &bundle.recovery_key_formatted,
            &bundle.recovery_encrypted_dek,
        )
        .expect("unlock with recovery key");
        assert_eq!(recovered_dek, bundle.dek_b64);

        let user_id = "11111111-1111-1111-1111-111111111111";
        let student_id = "22222222-2222-2222-2222-222222222222";
        let payload = r#"{"firstName":"Safia","level":"M","isNotGraded":false}"#;

        let cipher = encrypt_entity_envelope(&bundle.dek_b64, user_id, student_id, payload)
            .expect("encrypt envelope");
        assert!(cipher.starts_with("v1:"));

        let decrypted = decrypt_entity_envelope(&bundle.dek_b64, user_id, student_id, &cipher)
            .expect("decrypt envelope");
        assert_eq!(decrypted, payload);

        let wrong_entity = decrypt_entity_envelope(
            &bundle.dek_b64,
            user_id,
            "99999999-9999-9999-9999-999999999999",
            &cipher,
        );
        assert!(wrong_entity.is_err());
    }

    #[test]
    fn test_passkey_prf_wrap_and_unwrap_cycle() {
        use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

        let bundle = generate_vault_bundle("TeacherSecret2026!").expect("vault bundle");
        let prf_secret = [42u8; 32];
        let prf_secret_b64 = B64.encode(prf_secret);
        let credential_id = "cred_webauthn_prf_credential_test_id";

        let wrapped = wrap_dek_with_passkey_secret(&bundle.dek_b64, &prf_secret_b64, credential_id)
            .expect("wrap passkey");
        assert!(wrapped.starts_with("v1:"));

        let unwrapped = unwrap_dek_with_passkey_secret(&prf_secret_b64, credential_id, &wrapped)
            .expect("unwrap passkey");
        assert_eq!(unwrapped, bundle.dek_b64);

        // Tampered / wrong secret must be rejected
        let wrong_secret = [99u8; 32];
        let wrong_secret_b64 = B64.encode(wrong_secret);
        let fail = unwrap_dek_with_passkey_secret(&wrong_secret_b64, credential_id, &wrapped);
        assert!(fail.is_err());
    }

    #[test]
    fn test_transit_payload_encryption_and_decryption() {
        let transit_key = [77u8; 32];
        let original_json = r#"{"token":"jwt_123","email":"test@schule.de","dekB64":"mock_dek"}"#;

        let encrypted = encrypt_transit_payload(&transit_key, original_json).expect("encrypt transit payload");
        assert!(encrypted.starts_with("v1:"));

        let decrypted = decrypt_transit_payload(&transit_key, &encrypted).expect("decrypt transit payload");
        assert_eq!(decrypted, original_json);

        // Wrong key must fail
        let wrong_key = [88u8; 32];
        let fail = decrypt_transit_payload(&wrong_key, &encrypted);
        assert!(fail.is_err());
    }

    #[test]
    fn test_englisch_6_sj_2627_grading_scenario() {
        let config = SubjectGradingConfig {
            scale_id: GradingScaleId::DeClassic1To6,
            weighting_mode: WeightingMode::CategoryBuckets,
            scale_empty_categories: true,
            enable_student_levels: true,
            level_threshold_offsets: HashMap::from([
                ("G".into(), -5.0),
                ("M".into(), 0.0),
                ("E".into(), 4.0),
            ]),
            custom_thresholds: None,
        };

        let categories = vec![
            CategoryConfig {
                id: "cat_lnw".into(),
                name: "Große LNW".into(),
                short_code: "LNW".into(),
                weight: 0.50,
                drop_lowest_count: 0,
            },
            CategoryConfig {
                id: "cat_muendl".into(),
                name: "Mündlich".into(),
                short_code: "Mündl".into(),
                weight: 0.30,
                drop_lowest_count: 0,
            },
            CategoryConfig {
                id: "cat_tests".into(),
                name: "Tests".into(),
                short_code: "Test".into(),
                weight: 0.20,
                drop_lowest_count: 0,
            },
        ];

        let assessments = vec![
            AssessmentConfig {
                id: "lnw_1".into(),
                category_id: "cat_lnw".into(),
                title: "LNW 1".into(),
                term_id: "hj1".into(),
                weight: 1.0,
                input_mode: AssessmentInputMode::Percent,
                max_points: Some(45.0),
            },
            AssessmentConfig {
                id: "test_1".into(),
                category_id: "cat_tests".into(),
                title: "Test 1".into(),
                term_id: "hj1".into(),
                weight: 1.0,
                input_mode: AssessmentInputMode::Percent,
                max_points: Some(15.0),
            },
        ];

        let students = vec![
            StudentProfile {
                id: "s_safia".into(),
                name: "Safia".into(),
                level: Some("M".into()),
                is_not_graded: false,
                is_archived: false,
            },
            StudentProfile {
                id: "s_kira".into(),
                name: "Kira".into(),
                level: Some("G".into()),
                is_not_graded: false,
                is_archived: false,
            },
            StudentProfile {
                id: "s_vincent".into(),
                name: "Vincent".into(),
                level: Some("M".into()),
                is_not_graded: false,
                is_archived: false,
            },
            StudentProfile {
                id: "s_luis".into(),
                name: "Luis".into(),
                level: Some("E".into()),
                is_not_graded: false,
                is_archived: false,
            },
        ];

        let grades = vec![
            GradeEntry {
                student_id: "s_safia".into(),
                assessment_id: "test_1".into(),
                status: GradeStatus::Graded,
                percent_value: Some(73.0),
                raw_points: Some(11.0),
                direct_grade_value: None,
                comment: None,
            },
            GradeEntry {
                student_id: "s_kira".into(),
                assessment_id: "test_1".into(),
                status: GradeStatus::Graded,
                percent_value: Some(47.0),
                raw_points: Some(7.0),
                direct_grade_value: None,
                comment: None,
            },
            GradeEntry {
                student_id: "s_luis".into(),
                assessment_id: "test_1".into(),
                status: GradeStatus::Graded,
                percent_value: Some(93.0),
                raw_points: Some(14.0),
                direct_grade_value: None,
                comment: None,
            },
        ];

        let report = calculate_class_report(&config, &categories, &assessments, &students, &grades, Some("hj1"));
        assert_eq!(report.student_summaries.len(), 4);

        let safia = &report.student_summaries[0];
        assert_eq!(safia.overall_percent, Some(73.0));
        assert_eq!(safia.overall_display_grade, "2-");
        assert!(safia.is_preliminary);

        let vincent = &report.student_summaries[2];
        assert_eq!(vincent.overall_percent, None);
        assert_eq!(vincent.overall_display_grade, "—");

        let needed_in_lnw = simulate_needed_score_for_target(safia, &categories, "cat_lnw", 80.0)
            .expect("simulation result");
        assert!((needed_in_lnw - 82.8).abs() < 0.15);

        // Verify JSON deserialization of GradingScaleId from frontend strings
        let scale1: GradingScaleId = serde_json::from_str(r#""de_classic_1_to_6""#).expect("de_classic_1_to_6");
        assert_eq!(scale1, GradingScaleId::DeClassic1To6);
        let scale2: GradingScaleId = serde_json::from_str(r#""de_oberstufe_0_to_15""#).expect("de_oberstufe_0_to_15");
        assert_eq!(scale2, GradingScaleId::DeOberstufe0To15);

        // Verify recovery auth key derivation is deterministic and distinct from recovery KEK
        let bundle = generate_vault_bundle("LehrkraftGeheim2026!").expect("vault bundle");
        let derived_rec_auth =
            derive_recovery_auth_key(&bundle.recovery_key_formatted).expect("derive recovery auth");
        assert_eq!(derived_rec_auth, bundle.recovery_auth_key_b64);
        assert_ne!(derived_rec_auth, bundle.auth_key_b64);
    }

    #[test]
    fn test_drop_lowest_and_special_student_flags_and_weighting_modes() {
        let mut config = SubjectGradingConfig {
            scale_id: GradingScaleId::DeOberstufe0To15,
            weighting_mode: WeightingMode::CategoryBuckets,
            scale_empty_categories: true,
            enable_student_levels: false,
            level_threshold_offsets: HashMap::new(),
            custom_thresholds: None,
        };

        let categories = vec![CategoryConfig {
            id: "cat_tests".into(),
            name: "Tests".into(),
            short_code: "T".into(),
            weight: 1.0,
            drop_lowest_count: 1,
        }];

        let assessments = vec![
            AssessmentConfig {
                id: "t1".into(),
                category_id: "cat_tests".into(),
                title: "Test 1".into(),
                term_id: "hj1".into(),
                weight: 1.0,
                input_mode: AssessmentInputMode::Points,
                max_points: Some(20.0),
            },
            AssessmentConfig {
                id: "t2".into(),
                category_id: "cat_tests".into(),
                title: "Test 2".into(),
                term_id: "hj1".into(),
                weight: 1.0,
                input_mode: AssessmentInputMode::Points,
                max_points: Some(20.0),
            },
        ];

        let students = vec![
            StudentProfile {
                id: "s_active".into(),
                name: "Active Student".into(),
                level: None,
                is_not_graded: false,
                is_archived: false,
            },
            StudentProfile {
                id: "s_ob".into(),
                name: "Ohne Bewertung".into(),
                level: None,
                is_not_graded: true,
                is_archived: false,
            },
            StudentProfile {
                id: "s_arch".into(),
                name: "Archived Student".into(),
                level: None,
                is_not_graded: false,
                is_archived: true,
            },
        ];

        let grades = vec![
            GradeEntry {
                student_id: "s_active".into(),
                assessment_id: "t1".into(),
                status: GradeStatus::Graded,
                percent_value: None,
                raw_points: Some(10.0), // 50% (should be dropped by drop_lowest_count = 1)
                direct_grade_value: None,
                comment: None,
            },
            GradeEntry {
                student_id: "s_active".into(),
                assessment_id: "t2".into(),
                status: GradeStatus::Graded,
                percent_value: None,
                raw_points: Some(19.0), // 95% (kept -> 15 Punkte in Oberstufe)
                direct_grade_value: None,
                comment: None,
            },
            GradeEntry {
                student_id: "s_ob".into(),
                assessment_id: "t1".into(),
                status: GradeStatus::Graded,
                percent_value: Some(90.0),
                raw_points: Some(18.0),
                direct_grade_value: None,
                comment: None,
            },
            GradeEntry {
                student_id: "s_arch".into(),
                assessment_id: "t1".into(),
                status: GradeStatus::Graded,
                percent_value: Some(10.0),
                raw_points: Some(2.0),
                direct_grade_value: None,
                comment: None,
            },
        ];

        let report =
            calculate_class_report(&config, &categories, &assessments, &students, &grades, None);
        assert_eq!(report.student_summaries.len(), 3);
        // Only active graded student counts toward class average & histogram (o.B. and archived are excluded)
        assert_eq!(report.class_average_percent, Some(95.0));
        assert_eq!(report.distribution_buckets.iter().sum::<usize>(), 1);

        let active = &report.student_summaries[0];
        assert_eq!(active.overall_percent, Some(95.0));
        assert_eq!(active.overall_display_grade, "15 Pkt (1+)");
        assert_eq!(active.category_results[0].graded_count, 1);

        let ob = &report.student_summaries[1];
        assert_eq!(ob.overall_display_grade, "o.B.");

        // Test DirectWeights mode (both assessments included since CategoryBuckets drop_lowest is not active in DirectWeights)
        config.weighting_mode = WeightingMode::DirectWeights;
        let report_direct =
            calculate_class_report(&config, &categories, &assessments, &students, &grades, None);
        assert_eq!(report_direct.student_summaries[0].overall_percent, Some(72.5));

        // Test TotalPoints mode (10 + 19 = 29 / 40 = 72.5%)
        config.weighting_mode = WeightingMode::TotalPoints;
        let report_points =
            calculate_class_report(&config, &categories, &assessments, &students, &grades, None);
        assert_eq!(report_points.student_summaries[0].overall_percent, Some(72.5));
    }

    #[test]
    fn test_what_if_simulator_v2_all_three_modes() {
        let mut config = SubjectGradingConfig {
            scale_id: GradingScaleId::DeClassic1To6,
            weighting_mode: WeightingMode::CategoryBuckets,
            scale_empty_categories: true,
            enable_student_levels: false,
            level_threshold_offsets: HashMap::new(),
            custom_thresholds: None,
        };

        let categories = vec![
            CategoryConfig {
                id: "cat_main".into(),
                name: "Klassenarbeiten".into(),
                short_code: "KA".into(),
                weight: 1.0,
                drop_lowest_count: 0,
            },
            CategoryConfig {
                id: "cat_oral".into(),
                name: "Mündlich".into(),
                short_code: "M".into(),
                weight: 1.0,
                drop_lowest_count: 0,
            },
        ];

        let mut assessments = vec![
            AssessmentConfig {
                id: "ka_1".into(),
                category_id: "cat_main".into(),
                title: "1. KA".into(),
                term_id: "hj1".into(),
                weight: 1.0,
                input_mode: AssessmentInputMode::Percent,
                max_points: Some(50.0),
            },
            AssessmentConfig {
                id: "m_1".into(),
                category_id: "cat_oral".into(),
                title: "Mündlich 1".into(),
                term_id: "hj1".into(),
                weight: 1.0,
                input_mode: AssessmentInputMode::Percent,
                max_points: Some(20.0),
            },
        ];

        let student = StudentProfile {
            id: "s_sim".into(),
            name: "Simulator Student".into(),
            level: None,
            is_not_graded: false,
            is_archived: false,
        };
        let students = vec![student.clone()];

        let mut grades = vec![
            GradeEntry {
                student_id: "s_sim".into(),
                assessment_id: "ka_1".into(),
                status: GradeStatus::Graded,
                percent_value: Some(60.0),
                raw_points: Some(30.0),
                direct_grade_value: None,
                comment: None,
            },
            GradeEntry {
                student_id: "s_sim".into(),
                assessment_id: "m_1".into(),
                status: GradeStatus::Graded,
                percent_value: Some(80.0),
                raw_points: Some(16.0),
                direct_grade_value: None,
                comment: None,
            },
        ];

        // 1. Test CategoryBuckets Mode
        config.weighting_mode = WeightingMode::CategoryBuckets;
        let report1 = calculate_class_report(&config, &categories, &assessments, &students, &grades, None);
        let summary1 = &report1.student_summaries[0];
        assert_eq!(summary1.overall_percent, Some(70.0)); // (60 + 80)/2 = 70%

        // Simulate needed score in "cat_main" to reach 75.0% overall
        let target_pct = 75.0;
        let sim_cat_needed = simulate_needed_score_v2(
            &config,
            &categories,
            &assessments,
            &grades,
            &student,
            summary1,
            "cat_main",
            target_pct,
            None,
            Some(1.0),
            Some(50.0),
        ).expect("sim needed");
        assert_eq!(sim_cat_needed, 80.0);

        // Verify: insert new assessment in cat_main with 80% and compute report
        let new_assess = AssessmentConfig {
            id: "ka_2".into(),
            category_id: "cat_main".into(),
            title: "2. KA".into(),
            term_id: "hj1".into(),
            weight: 1.0,
            input_mode: AssessmentInputMode::Percent,
            max_points: Some(50.0),
        };
        assessments.push(new_assess);
        grades.push(GradeEntry {
            student_id: "s_sim".into(),
            assessment_id: "ka_2".into(),
            status: GradeStatus::Graded,
            percent_value: Some(sim_cat_needed),
            raw_points: Some(40.0),
            direct_grade_value: None,
            comment: None,
        });
        let verify_cat_report = calculate_class_report(&config, &categories, &assessments, &students, &grades, None);
        assert!(verify_cat_report.student_summaries[0].overall_percent.unwrap() >= target_pct);

        // Reset assessments and grades
        assessments.pop();
        grades.pop();

        // 2. Test DirectWeights Mode
        config.weighting_mode = WeightingMode::DirectWeights;
        let report_dw = calculate_class_report(&config, &categories, &assessments, &students, &grades, None);
        let summary_dw = &report_dw.student_summaries[0];
        assert_eq!(summary_dw.overall_percent, Some(70.0));

        let sim_dw_needed = simulate_needed_score_v2(
            &config,
            &categories,
            &assessments,
            &grades,
            &student,
            summary_dw,
            "cat_main",
            target_pct,
            None,
            Some(1.0),
            Some(50.0),
        ).expect("sim dw needed");
        assert_eq!(sim_dw_needed, 85.0);

        // Verify: adding assessment with 85% yields >= 75%
        let new_dw_assess = AssessmentConfig {
            id: "dw_new".into(),
            category_id: "cat_main".into(),
            title: "New Direct Assessment".into(),
            term_id: "hj1".into(),
            weight: 1.0,
            input_mode: AssessmentInputMode::Percent,
            max_points: Some(50.0),
        };
        assessments.push(new_dw_assess);
        grades.push(GradeEntry {
            student_id: "s_sim".into(),
            assessment_id: "dw_new".into(),
            status: GradeStatus::Graded,
            percent_value: Some(sim_dw_needed),
            raw_points: None,
            direct_grade_value: None,
            comment: None,
        });
        let verify_dw_report = calculate_class_report(&config, &categories, &assessments, &students, &grades, None);
        assert!(verify_dw_report.student_summaries[0].overall_percent.unwrap() >= target_pct);

        // Reset
        assessments.pop();
        grades.pop();

        // 3. Test TotalPoints Mode
        config.weighting_mode = WeightingMode::TotalPoints;
        let report_tp = calculate_class_report(&config, &categories, &assessments, &students, &grades, None);
        let summary_tp = &report_tp.student_summaries[0];
        // 30 / 50 + 16 / 20 = 46 / 70 = 65.714 -> 65.7%
        assert_eq!(summary_tp.overall_percent, Some(65.7));

        let sim_tp_needed = simulate_needed_score_v2(
            &config,
            &categories,
            &assessments,
            &grades,
            &student,
            summary_tp,
            "cat_main",
            70.0,
            None,
            Some(1.0),
            Some(30.0),
        ).expect("sim tp needed");

        // Verify: adding new assessment with max_points 30 and sim_tp_needed %
        let new_tp_assess = AssessmentConfig {
            id: "tp_new".into(),
            category_id: "cat_main".into(),
            title: "New Points Assessment".into(),
            term_id: "hj1".into(),
            weight: 1.0,
            input_mode: AssessmentInputMode::Points,
            max_points: Some(30.0),
        };
        let earned_pts = (sim_tp_needed / 100.0) * 30.0;
        assessments.push(new_tp_assess);
        grades.push(GradeEntry {
            student_id: "s_sim".into(),
            assessment_id: "tp_new".into(),
            status: GradeStatus::Graded,
            percent_value: Some(sim_tp_needed),
            raw_points: Some(earned_pts),
            direct_grade_value: None,
            comment: None,
        });
        let verify_tp_report = calculate_class_report(&config, &categories, &assessments, &students, &grades, None);
        assert!(verify_tp_report.student_summaries[0].overall_percent.unwrap() >= 70.0);
    }
}
