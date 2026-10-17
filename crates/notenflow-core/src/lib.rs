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
        let bundle = generate_vault_bundle("LehrerGeheim2026!").expect("vault bundle");
        assert_eq!(bundle.recovery_key_formatted.len(), 29);

        let unlocked = unlock_vault_with_password(
            "LehrerGeheim2026!",
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
    }
}
