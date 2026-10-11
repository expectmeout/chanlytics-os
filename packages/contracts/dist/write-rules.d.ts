import { z } from 'zod';

/**
 * The same config, with the rules that only apply on the way IN, and none of
 * the fields inside a section that the read would leave out (unknown-keys.ts).
 *
 * Wrapping TenantConfigSchema rather than replacing it, so the shape and the
 * lenience stay defined in exactly one place and this can only ever be
 * stricter.
 */
declare const TenantConfigWriteSchema: z.ZodPipe<z.ZodUnknown, z.ZodObject<{
    brain: z.ZodOptional<z.ZodObject<{
        business_name: z.ZodString;
        phone_display: z.ZodOptional<z.ZodString>;
        booking_link: z.ZodOptional<z.ZodString>;
        system_prompt: z.ZodString;
        profile: z.ZodOptional<z.ZodObject<{
            address: z.ZodOptional<z.ZodString>;
            hours: z.ZodOptional<z.ZodRecord<z.ZodEnum<{
                sun: "sun";
                mon: "mon";
                tue: "tue";
                wed: "wed";
                thu: "thu";
                fri: "fri";
                sat: "sat";
            }> & z.core.$partial, z.ZodObject<{
                open: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                close: z.ZodOptional<z.ZodNullable<z.ZodString>>;
                intervals: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    open: z.ZodString;
                    close: z.ZodString;
                }, z.core.$strip>>>;
            }, z.core.$strip>>>;
            closures: z.ZodOptional<z.ZodArray<z.ZodObject<{
                date: z.ZodString;
                until: z.ZodOptional<z.ZodString>;
                note: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            services: z.ZodOptional<z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                duration_min: z.ZodOptional<z.ZodNumber>;
                price_note: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>>;
            languages: z.ZodOptional<z.ZodArray<z.ZodString>>;
            guardrails: z.ZodOptional<z.ZodObject<{
                never_quote_prices: z.ZodOptional<z.ZodBoolean>;
                never_confirm_booking: z.ZodOptional<z.ZodBoolean>;
                disclose_ai: z.ZodOptional<z.ZodBoolean>;
                no_health_advice: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>>;
            escalate_when: z.ZodOptional<z.ZodArray<z.ZodString>>;
            tone: z.ZodOptional<z.ZodString>;
            handoff_number: z.ZodOptional<z.ZodString>;
            phone_greeting: z.ZodCatch<z.ZodOptional<z.ZodString>>;
            website: z.ZodOptional<z.ZodString>;
            notes: z.ZodOptional<z.ZodArray<z.ZodObject<{
                title: z.ZodString;
                text: z.ZodString;
            }, z.core.$strip>>>;
            booking_rules: z.ZodOptional<z.ZodObject<{
                lead_hours: z.ZodOptional<z.ZodNumber>;
                buffer_min: z.ZodOptional<z.ZodNumber>;
                max_days_ahead: z.ZodOptional<z.ZodNumber>;
                slot_min: z.ZodOptional<z.ZodNumber>;
                consult_first: z.ZodOptional<z.ZodArray<z.ZodString>>;
                party_max: z.ZodOptional<z.ZodNumber>;
                ask_email: z.ZodOptional<z.ZodBoolean>;
                notes: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            extra_instructions: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        fallbacks: z.ZodObject<{
            greeting: z.ZodString;
            error: z.ZodString;
            non_text: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    notifications: z.ZodOptional<z.ZodObject<{
        escalation_emails: z.ZodArray<z.ZodString>;
        from: z.ZodOptional<z.ZodString>;
        email_off: z.ZodCatch<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    }, z.core.$strip>>;
    calendar: z.ZodOptional<z.ZodObject<{
        ical_url: z.ZodString;
    }, z.core.$strip>>;
    bookings: z.ZodOptional<z.ZodObject<{
        tool: z.ZodOptional<z.ZodString>;
        by_hand: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    features: z.ZodOptional<z.ZodObject<{
        vision: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>>;

/**
 * Sign-up's inputs (the invite code, the form) and the workspace it keeps for later (pendingWorkspaceOf), as the
 * routes read them, apart from signup.ts's words. zod is not built into the browser's contracts (decision 0024, the
 * browser's entry): a page that says these words loads none of it.
 */

declare const SignupSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    password: z.ZodOptional<z.ZodString>;
    timezone: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;

export { SignupSchema, TenantConfigWriteSchema };
