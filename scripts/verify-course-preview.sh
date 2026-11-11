#!/usr/bin/env bash
# ==============================================================================
# AVANA Course Social Preview & SPA Routing Post-Deployment Verification
# ==============================================================================
# Evaluates routing differentiation between Social Crawlers and Human Browsers.
# Exits with 0 on success, or 1 if any assertion fails.
#
# Usage:
#   ./scripts/verify-course-preview.sh [BASE_URL] [COURSE_UUID]
#
# Examples:
#   # Test production:
#   ./scripts/verify-course-preview.sh https://aavana.ir 550379aa-ff6c-4daf-be2d-11fb4d66fb2e
#
#   # Test local Fastify API upstream:
#   ./scripts/verify-course-preview.sh http://127.0.0.1:3000 550379aa-ff6c-4daf-be2d-11fb4d66fb2e
# ==============================================================================

set -euo pipefail

BASE_URL="${1:-https://aavana.ir}"
COURSE_UUID="${2:-550379aa-ff6c-4daf-be2d-11fb4d66fb2e}"

COURSE_URL="${BASE_URL}/courses/${COURSE_UUID}"
COURSE_SLASH_URL="${BASE_URL}/courses/${COURSE_UUID}/"
CARD_URL="${BASE_URL}/v1/share/courses/${COURSE_UUID}/card.png"
EXPLORE_URL="${BASE_URL}/courses/explore"

CRAWLER_UA="TelegramBot (like TwitterBot)"
BROWSER_UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

FAILURES=0

assert_true() {
    local condition="$1"
    local message="$2"
    if ! eval "${condition}"; then
        echo "  [FAIL] ${message}"
        FAILURES=$((FAILURES + 1))
    else
        echo "  [PASS] ${message}"
    fi
}

echo "=============================================================================="
echo "AVANA Course Social Preview & SPA Verification"
echo "Target Base:   ${BASE_URL}"
echo "Course UUID:   ${COURSE_UUID}"
echo "Course URL:    ${COURSE_URL}"
echo "Card Image:    ${CARD_URL}"
echo "=============================================================================="

# ------------------------------------------------------------------------------
# Test 1: Social Crawler Request (TelegramBot) on /courses/<UUID>
# ------------------------------------------------------------------------------
echo ""
echo "--- Test 1: Social Crawler (TelegramBot) on ${COURSE_URL} ---"
CRAWLER_HEADER="${TMP_DIR}/crawler_headers.txt"
CRAWLER_BODY="${TMP_DIR}/crawler_body.html"

if ! curl -sS -D "${CRAWLER_HEADER}" -A "${CRAWLER_UA}" -o "${CRAWLER_BODY}" "${COURSE_URL}"; then
    echo "  [FAIL] curl request failed for crawler URL"
    FAILURES=$((FAILURES + 1))
else
    CRAWLER_STATUS="$(head -n 1 "${CRAWLER_HEADER}" | awk '{print $2}' | tr -d '\r')"
    CRAWLER_CT="$(grep -i '^content-type:' "${CRAWLER_HEADER}" | tr -d '\r' | cut -d' ' -f2- || true)"
    CRAWLER_SIZE="$(wc -c < "${CRAWLER_BODY}" | tr -d ' ')"

    echo "  HTTP Status:  ${CRAWLER_STATUS}"
    echo "  Content-Type: ${CRAWLER_CT}"
    echo "  Payload Size: ${CRAWLER_SIZE} bytes"

    assert_true "[[ '${CRAWLER_STATUS}' == '200' ]]" "Crawler status must be HTTP 200"
    assert_true "[[ '${CRAWLER_CT}' == *'text/html'* ]]" "Crawler content-type must be text/html"
    assert_true "grep -qi '<meta property=\"og:title\"' '${CRAWLER_BODY}'" "HTML must contain og:title"
    assert_true "grep -qi '<meta property=\"og:image\"' '${CRAWLER_BODY}'" "HTML must contain og:image"
    assert_true "grep -qi '<meta property=\"og:description\"' '${CRAWLER_BODY}'" "HTML must contain og:description"
    assert_true "grep -qi '<meta property=\"og:url\"' '${CRAWLER_BODY}'" "HTML must contain og:url"
    assert_true "grep -qi '<meta name=\"twitter:card\"' '${CRAWLER_BODY}'" "HTML must contain twitter:card"
    assert_true "! grep -qi 'http-equiv=\"refresh\"' '${CRAWLER_BODY}'" "Crawler HTML must NOT contain meta-refresh (avoids bot redirect loop)"
fi

# ------------------------------------------------------------------------------
# Test 2: Social Crawler Request with Trailing Slash /courses/<UUID>/
# ------------------------------------------------------------------------------
echo ""
echo "--- Test 2: Social Crawler with Trailing Slash on ${COURSE_SLASH_URL} ---"
SLASH_HEADER="${TMP_DIR}/slash_headers.txt"
SLASH_BODY="${TMP_DIR}/slash_body.html"

if ! curl -sS -D "${SLASH_HEADER}" -A "${CRAWLER_UA}" -o "${SLASH_BODY}" "${COURSE_SLASH_URL}"; then
    echo "  [FAIL] curl request failed for trailing slash URL"
    FAILURES=$((FAILURES + 1))
else
    SLASH_STATUS="$(head -n 1 "${SLASH_HEADER}" | awk '{print $2}' | tr -d '\r')"
    assert_true "[[ '${SLASH_STATUS}' == '200' ]]" "Trailing slash crawler status must be HTTP 200"
    assert_true "grep -qi '<meta property=\"og:title\"' '${SLASH_BODY}'" "Trailing slash HTML must contain og:title"
fi

# ------------------------------------------------------------------------------
# Test 3: Human Browser Request on /courses/<UUID> (Must receive SPA)
# ------------------------------------------------------------------------------
echo ""
echo "--- Test 3: Human Browser (Chrome) on ${COURSE_URL} ---"
BROWSER_HEADER="${TMP_DIR}/browser_headers.txt"
BROWSER_BODY="${TMP_DIR}/browser_body.html"

if ! curl -sS -D "${BROWSER_HEADER}" -A "${BROWSER_UA}" -o "${BROWSER_BODY}" "${COURSE_URL}"; then
    echo "  [FAIL] curl request failed for browser URL"
    FAILURES=$((FAILURES + 1))
else
    BROWSER_STATUS="$(head -n 1 "${BROWSER_HEADER}" | awk '{print $2}' | tr -d '\r')"
    BROWSER_CT="$(grep -i '^content-type:' "${BROWSER_HEADER}" | tr -d '\r' | cut -d' ' -f2- || true)"
    BROWSER_SIZE="$(wc -c < "${BROWSER_BODY}" | tr -d ' ')"

    echo "  HTTP Status:  ${BROWSER_STATUS}"
    echo "  Content-Type: ${BROWSER_CT}"
    echo "  Payload Size: ${BROWSER_SIZE} bytes"

    assert_true "[[ '${BROWSER_STATUS}' == '200' ]]" "Browser status must be HTTP 200"
    assert_true "[[ '${BROWSER_CT}' == *'text/html'* ]]" "Browser content-type must be text/html"

    # Browser response comparison against Crawler response:
    # When testing against full Nginx, browser receives the SPA index.html/bundle (different size and structure)
    if [[ "${BASE_URL}" != *"127.0.0.1:3000"* ]]; then
        assert_true "[[ '${BROWSER_SIZE}' -ne '${CRAWLER_SIZE}' ]]" "Browser payload size must differ from crawler preview HTML"
        assert_true "grep -qi '<div id=\"root\"' '${BROWSER_BODY}' || grep -qi '<script' '${BROWSER_BODY}'" "Browser response must serve the SPA shell"
    fi
fi

# ------------------------------------------------------------------------------
# Test 4: Dedicated Course Share Card Image /v1/share/courses/<UUID>/card.png
# ------------------------------------------------------------------------------
echo ""
echo "--- Test 4: Course Share Card Image on ${CARD_URL} ---"
CARD_HEADER="${TMP_DIR}/card_headers.txt"
CARD_BODY="${TMP_DIR}/card_body.bin"

if ! curl -sS -D "${CARD_HEADER}" -A "${CRAWLER_UA}" -o "${CARD_BODY}" "${CARD_URL}"; then
    echo "  [FAIL] curl request failed for card image URL"
    FAILURES=$((FAILURES + 1))
else
    CARD_STATUS="$(head -n 1 "${CARD_HEADER}" | awk '{print $2}' | tr -d '\r')"
    CARD_CT="$(grep -i '^content-type:' "${CARD_HEADER}" | tr -d '\r' | cut -d' ' -f2- || true)"
    CARD_SIZE="$(wc -c < "${CARD_BODY}" | tr -d ' ')"

    echo "  HTTP Status:  ${CARD_STATUS}"
    echo "  Content-Type: ${CARD_CT}"
    echo "  Image Size:   ${CARD_SIZE} bytes"

    assert_true "[[ '${CARD_STATUS}' == '200' ]]" "Card image status must be HTTP 200"
    assert_true "[[ '${CARD_CT}' == *'image/png'* ]]" "Card image content-type must be image/png"
    assert_true "[[ ${CARD_SIZE} -gt 1000 ]]" "Card image size must be greater than 1KB (${CARD_SIZE} bytes)"
fi

# ------------------------------------------------------------------------------
# Test 5: General Path Non-UUID (/courses/explore)
# ------------------------------------------------------------------------------
echo ""
echo "--- Test 5: General Path (${EXPLORE_URL}) ---"
EXPLORE_HEADER="${TMP_DIR}/explore_headers.txt"
EXPLORE_BODY="${TMP_DIR}/explore_body.html"

if ! curl -sS -D "${EXPLORE_HEADER}" -A "${CRAWLER_UA}" -o "${EXPLORE_BODY}" "${EXPLORE_URL}"; then
    echo "  [FAIL] curl request failed for explore URL"
    FAILURES=$((FAILURES + 1))
else
    EXPLORE_STATUS="$(head -n 1 "${EXPLORE_HEADER}" | awk '{print $2}' | tr -d '\r')"
    echo "  HTTP Status:  ${EXPLORE_STATUS}"
    assert_true "[[ '${EXPLORE_STATUS}' == '200' ]]" "/courses/explore must return HTTP 200"

    if [[ "${BASE_URL}" != *"127.0.0.1:3000"* ]]; then
        assert_true "grep -qi '<div id=\"root\"' '${EXPLORE_BODY}' || grep -qi '<script' '${EXPLORE_BODY}'" "/courses/explore must serve the SPA shell"
    fi
fi

# ------------------------------------------------------------------------------
# Summary & Exit Code
# ------------------------------------------------------------------------------
echo ""
echo "=============================================================================="
if [[ ${FAILURES} -eq 0 ]]; then
    echo "ALL VERIFICATION CHECKS PASSED (0 failures)."
    echo "=============================================================================="
    exit 0
else
    echo "VERIFICATION FAILED (${FAILURES} failure(s) detected)."
    echo "=============================================================================="
    exit 1
fi
