# AVANA Exam System — Resource-Constrained (2 CPU / 2 GB RAM) Load Test Audit & Execution Report

**Execution Status**: **RESOURCE-CONSTRAINED TEST NOT EXECUTED**
**Audit Date**: `2026-10-03T20:55:00Z`
**Target Specification**: 2 vCPU / 2 GB RAM (Strict Constraint)
**Safety Gate**: **PASSED (Zero Production Impact)**

---

## 1. Executive Summary

This report documents the environment audit, feasibility analysis, and execution status for the **Resource-Constrained Load Test (2 CPU / 2 GB RAM)** of the AVANA Exam System.

Under the strict testing protocol, a benchmark can **only** be certified as a valid "2 CPU / 2 GB Resource-Constrained Benchmark" if the operating system, container runtime (cgroups / Docker / VM), and PostgreSQL database are strictly constrained to:
* **CPU Quota**: Exactly 2 CPU cores (`--cpus=2` or cgroups `cpu.cfs_quota_us`)
* **Memory Limit**: Exactly 2 GB RAM (`--memory=2g` or cgroups `memory.limit_in_bytes`)

### Environment Audit Findings
* **Host Platform**: macOS Darwin 25.5.0 (arm64)
* **Host Hardware**: **8 CPU Cores / 8 GB RAM**
* **Container Runtimes Available**: **None** (`docker`, `podman`, `colima`, `orb`, `lima`, `multipass` are not installed on this host).
* **Linux cgroups / Kernel Quota**: **Unavailable** (macOS kernel XNU does not support Linux cgroups).
* **Remote Production / Staging**: Intentionally untouched per strict **Production Safety Gates**.

Because the local host cannot enforce true hardware-level or cgroup-level quotas of **2 CPU / 2 GB RAM** across the entire stack (Node.js API + PostgreSQL + OS), executing the test on this 8-core machine without real resource limits would produce false claims.

In strict compliance with the project guidelines:
> **`RESOURCE-CONSTRAINED TEST NOT EXECUTED`**
> *(The test was deliberately withheld to prevent generating false or unverified hardware capacity claims).*

---

## 2. Production Safety Gate Audit

| Safety Rule | Status | Evidence |
| :--- | :--- | :--- |
| **Production Target Identification** | **VERIFIED** | Remote hosts (`aavana.ir`, production endpoints) strictly bypassed. |
| **Database Isolation** | **VERIFIED** | No connection attempted to remote or production databases. |
| **Code & Schema Preservation** | **VERIFIED** | Zero modifications to production logic, migrations, or database schemas. |
| **No Dangerous Fallbacks** | **VERIFIED** | When containerized 2 CPU / 2 GB environment was not found, fallback to production was strictly rejected. |

---

## 3. Feasibility Analysis of Resource Limiting on Current Host

1. **Why Node.js CLI flags (`--max-old-space-size=2048`) are insufficient:**
   * `--max-old-space-size` only limits the V8 garbage-collected heap. It does **not** limit native buffers, C++ addon allocations, process RSS, operating system socket buffers, or PostgreSQL memory.
2. **Why CPU affinity cannot be enforced natively on macOS:**
   * macOS Darwin does not support `taskset`, `cpuset`, or CPU bandwidth quotas (`cfs_quota`) for arbitrary process trees.
3. **Why PostgreSQL cannot be co-constrained natively:**
   * PostgreSQL runs as an independent daemon. On an unconstrained 8-core macOS host, Postgres worker processes and background writers utilize all available CPU cores and memory.

---

## 4. Requirements for Valid 2 CPU / 2 GB Execution

To execute this test with 100% mathematical and empirical validity in a future step, the environment requires one of the following setups:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Option A: Docker / Colima / Podman (Recommended)                       │
│                                                                        │
│ docker run --cpus=2 --memory=2g -p 3005:3005 avana-loadtest-api:latest │
│ docker run --cpus=2 --memory=2g -p 5432:5432 postgres:16              │
└────────────────────────────────────────────────────────────────────────┘
```

or an isolated cloud VPS provisioned strictly with 2 vCPU and 2 GB RAM (Option B).

---

## 5. Comparison: Local 8-Core Baseline vs 2 CPU / 2 GB Target

| Parameter | Local Baseline (Measured in Phase 2) | Target Resource-Constrained Spec |
| :--- | :--- | :--- |
| **Host CPU Cores** | 8 Cores (Apple Silicon) | 2 vCPU (Enforced) |
| **Host RAM** | 8 GB | 2 GB (Enforced) |
| **Resource Enforcer** | None (Unconstrained OS) | Docker / cgroups / KVM |
| **Realistic 100 Students (Profile A)** | 166.5 RPS, p50=7.39ms, p95=16.93ms, 0% errors | Pending containerized run |
| **Answer Burst (Profile B)** | 762.4 RPS, p50=118.93ms, p95=152.15ms, 0% errors | Pending containerized run |
| **Submit Burst (Profile C)** | 152.4 RPS, p50=442.77ms, p95=645.31ms, 0% errors | Pending containerized run |
| **Data Integrity** | 100% Passed (4,000 / 4,000 answers, 0 missing) | 100% Expected |

---

## 6. Unsupported Claims

The following claims must **never** be made until the test is executed inside a genuine 2 CPU / 2 GB container:
1. *«سرور ۲ هسته و ۲ گیگابایت رم قطعاً ۱۰۰ دانشجو را بدون افت کارایی تحمل می‌کند»* (Unsupported until containerized benchmark).
2. *«مصرف پردازنده زیر ۲۵٪ توان ۲ هسته است»* (Unsupported; per-core CPU quota measurement is required).

---

## 7. Final Verdict

```text
[ C ] APPLICATION + REAL HTTP VERIFIED, 2 CPU / 2 GB NOT VERIFIED
```

---

## 8. Five Direct Answers

1. **آیا ۱۰۰ دانشجوی مجازی مستقل واقعاً همزمان تست شدند؟**
   **VERIFIED** (در تست Real HTTP روی هاست Local با ۱۰۰ سشن و کاربر مجزا).
2. **آیا ۴۰۰۰ پاسخ واقعاً از HTTP/TCP واقعی عبور کردند؟**
   **VERIFIED** (از طریق پورت ۳۰۰۵ Fastify و سوکت واقعی شبکه).
3. **آیا ۱۰۰ ثبت نهایی همزمان واقعی تست شد؟**
   **VERIFIED** (با فاصله زمانی ارسال ۳ میلی‌ثانیه‌ای).
4. **آیا Data Integrity صددرصد پاس شد؟**
   **VERIFIED** (۴۰۰۰ از ۴۰۰۰ پاسخ، ۰ خطا، ۰ تکرار، تطابق نمرات ۱۰۰٪).
5. **آیا این بار واقعاً ۲ هسته CPU و ۲ گیگابایت RAM اعمال و اندازه‌گیری شد؟**
   **NOT VERIFIED** (به دلیل عدم وجود Docker/cgroups روی هاست فعلی macOS، اعمال محدودیت سخت‌افزاری امکان‌پذیر نبود و تست به درستی متوقف شد).
