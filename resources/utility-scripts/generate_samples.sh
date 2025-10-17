#!/usr/bin/env bash
set -euo pipefail

# PARAMETERS -------------------------------------------------------------------
PREFIX="financial-sample"                    # Base name for XHTML/marker pairs
START=101                                    # First numerical identifier (inclusive)
END=200                                      # Last numerical identifier (inclusive)
DIGITS=4                                     # Width of zero padding; 4 -> 0001..9999
OUTPUT_DIR="src/main/resources/html/samples"  # Destination folder for generated pairs
MIN_PAGES=1                                  # Minimum number of pages per sample
MAX_PAGES=4                                  # Maximum number of pages per sample
MIN_COLS=3                                   # Minimum number of financial columns per table
MAX_COLS=6                                   # Maximum number of financial columns per table
MIN_ROWS=4                                   # Minimum number of data rows per table
MAX_ROWS=24                                  # Maximum number of data rows per table
# -------------------------------------------------------------------------------

swap_if_needed() {
  local -n low=$1
  local -n high=$2
  if ((high < low)); then
    local tmp=$low
    low=$high
    high=$tmp
  fi
}

swap_if_needed MIN_PAGES MAX_PAGES
swap_if_needed MIN_COLS MAX_COLS
swap_if_needed MIN_ROWS MAX_ROWS

mkdir -p "${OUTPUT_DIR}"

rand_between() {
  local min=$1
  local max=$2
  if ((max == min)); then
    echo "${min}"
  else
    echo $((min + RANDOM % (max - min + 1)))
  fi
}

random_choice() {
  local arr_name=$1[@]
  local arr=("${!arr_name}")
  echo "${arr[$((RANDOM % ${#arr[@]}))]}"
}

pick_unique() {
  local count=$1
  shift
  local pool=("$@")
  local max_pick=${#pool[@]}
  ((count > max_pick)) && count=$max_pick
  local selected=()
  for ((j = 0; j < count; j++)); do
    local idx=$((RANDOM % ${#pool[@]}))
    selected+=("${pool[$idx]}")
    pool=("${pool[@]:0:$idx}" "${pool[@]:$((idx + 1))}")
  done
  printf '%s\n' "${selected[@]}"
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-'
}

company_names=(
  "Aurora Analytics"
  "Helios Holdings"
  "Meridian Ventures"
  "Nova Spectrum Group"
  "Summit Advisory"
  "Vertex Labs"
  "Blue Horizon Capital"
  "Trinity Ledger"
  "Atlas Financial"
  "Crestline Partners"
  "Vectorium Finance"
  "Pinnacle Ledger"
)

report_titles=(
  "Quarterly Performance Review"
  "Strategic Revenue Outlook"
  "Operational Efficiency Digest"
  "Market Pulse Assessment"
  "Consolidated Growth Tracker"
  "Shareholder Insights Briefing"
  "Enterprise Value Synopsis"
)

intro_paragraphs=(
  "This report captures the momentum observed across our diversified portfolio, highlighting the levers contributing most to operating leverage."
  "We continue to balance disciplined cost controls with selective investment, supporting resilient margins despite market volatility."
  "Customer sentiment and recurring revenue streams remain strong as we accelerate digital engagement initiatives throughout the regions."
  "Liquidity positions us to capitalise on near-term opportunities while sustaining longer-term innovation programmes in each division."
  "The leadership team monitors these indicators weekly to ensure we maintain compliance, service excellence, and shareholder value."
  "Core platforms remain resilient while adjacent services outpace expectations, expanding our blended lifetime value metrics."
)

narrative_blocks=(
  "Segment leaders noted improved throughput after automation upgrades, with fulfilment KPIs beating targets for the third consecutive month."
  "Pipeline velocity reflects stronger partner contributions, reinforcing the case for expanding co-selling agreements in priority territories."
  "Cost-to-serve metrics benefited from renegotiated logistics contracts, partially offsetting energy price pressure experienced in the quarter."
  "Customer lifetime value is trending upward as cross-sell programmes gain traction in the enterprise and public sector verticals."
  "Forecast accuracy improved following the rollout of the integrated planning playbook across operational teams."
  "Compliance reviews confirmed adherence to ISO frameworks, with remediation actions completed ahead of the upcoming surveillance audit."
  "The innovation council approved five new proofs-of-concept aligned with strategic themes in data intelligence and automation."
  "Employee engagement surveys recorded record participation rates, informing refreshed well-being programmes launching next period."
  "Working capital intensity improved sequentially as collections outpaced revenue recognition in three major regions."
  "Deferred revenue continues to expand, supporting improved visibility into the next two fiscal quarters."
)

action_checklist=(
  "Deepen scenario planning for supply-side constraints"
  "Expand partner enablement for priority solution bundles"
  "Accelerate invoicing automation in low-margin streams"
  "Conduct quarterly talent calibration for analytics teams"
  "Advance sustainability disclosures for key stakeholders"
  "Standardise procurement scorecards across regions"
  "Pilot customer-success playbooks in growth accounts"
  "Revisit capital allocation for in-flight programmes"
  "Enhance risk dashboards with real-time leading indicators"
  "Align marketing narratives with refreshed value propositions"
  "Update service catalogues to reflect refreshed SLAs"
  "Consolidate tooling footprints across shared service teams"
)

column_pool=(
  "Actuals (EUR M)"
  "Forecast (EUR M)"
  "Variance (EUR M)"
  "YoY %"
  "Run-Rate (EUR M)"
  "Contribution Margin %"
  "Cash Position (EUR M)"
  "Backlog (EUR M)"
  "OpEx (EUR M)"
  "Bookings (EUR M)"
  "Pipeline (EUR M)"
  "Renewals %"
)

segment_prefixes=(
  "Enterprise"
  "SMB"
  "Public Sector"
  "Channel"
  "Digital"
  "Operations"
  "Logistics"
  "Customer Care"
  "Innovation"
  "Services"
  "Analytics"
  "Platform"
)

segment_suffixes=(
  "Momentum"
  "Allocation"
  "Performance"
  "Stability"
  "Expansion"
  "Velocity"
  "Productivity"
  "Satisfaction"
  "Utilisation"
  "Pipeline"
  "Readiness"
  "Integrity"
)

page_topics=(
  "Operating KPIs"
  "Regional Highlights"
  "Revenue Streams"
  "Customer Intelligence"
  "Operational Excellence"
  "Risk & Compliance"
  "Innovation Updates"
  "Talent & Culture"
  "Financial Controls"
  "Sustainability Outlook"
)

deep_dive_focus=(
  "Margin optimisation initiatives reduced blended cost-to-serve by {metric}% across core business units."
  "Regional demand profiles indicate emerging opportunities in EMEA, balancing softer sentiment in APAC."
  "Modernisation of legacy workflows created {metric} hours of reclaimed capacity delivered back to customer success teams."
  "Cross-selling motions contributed {metric} incremental basis points to net retention during the trailing quarter."
  "Scenario modelling highlights resilience under tightened capital expenditure environments, maintaining service continuity."
  "Operational readiness drills validated our business continuity playbooks and informed minor updates to recovery sequencing."
)

closing_notes=(
  "Leadership will revisit these measures during the next steering committee to ensure alignment with strategic goals."
  "Action plans will be tracked in the programme management office with weekly checkpoints across accountable owners."
  "Risk mitigation activities remain on track with no material deviations from communicated remediation windows."
  "Continued vigilance on cost discipline and talent retention will anchor execution priorities into the next quarter."
)

opening_hours_options=(
  "Mon-Fri 08:30-18:00 CET"
  "Mon-Thu 09:00-17:30, Fri 09:00-16:00 CET"
  "Mon-Fri 08:00-17:00 CET, Sat by appointment"
  "24/5 Global Support Desk"
)

phone_numbers=(
  "+31 (0)20 555 0101"
  "+31 (0)20 555 0199"
  "+44 (0)20 8123 4455"
  "+49 (0)30 8800 2255"
)

COMPANY_LOGO_DATA="iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAVFBMVEVHcEzSAxnhABzKBBjhABvYARngABrSAhjRAhnVAhnCBRjeABrDBRjiACrhACDhAC7hACfhACThAB3CBRjRAhzIBBroOFfdAR7lFjnxg5ftX3jrUWzx8D1CAAAADXRSTlMAdvNP3h69CJQ21F7wo2ktJAAAAgdJREFUWMPtlsuSgyAQRUVR8dU8NKjx//9zOgKKE4hmFrPyblJF5R5vNzSaJLdu3YqqRF1ZCyvPWIFiTe6tNe9rMTuhoIwoq+wao2pbO0FkVMEu2rxSN5tdKVBmLSb8L0gpBQp/AFJWJiQFaYErIyVxQpNK/Vwm0aFWBgDBtU5umQwh5q+o0vM8684KEZCi/5VGrokMglaRzWMKJq0n3vENgSaxAQwCCUW4iCoFvjw1d7IE4WQJryKyIIApuczzMnEfIaTwCSbCyIIVFDDNs5fAEmw7dgJGqEOnIaeALVwOgK0Z3SHC2FbhFmgMMPEgwWsCAvrsMoC/BwA1hAH0BLDvYxiAPZhegK57BxwDjI9gD3AX+HMFdKcB6uBJIgq0AXQnAXoWvgqwhuVXCYcA4AK0kWHAWdB4DkwCwwkVgAEiA50XimtTw0EHPxZQVx/mGcdxfSzvtqE8+oe+J/EbiQAOtLlQ/AC+P17AenW/roRJiPcCdn+8ANsGAHkg+BuI/jb7fC1X1BBEwD+g/1MDfIJ3jQg3gsMD/ez09VT+Jhj/OFz0u5eLlI4hnf2qf6vCakS3efxVPxKK0WkYjB39LSkvv97zYtj1WO193XzzhZAza3b2k/MTCEHah1G/iuVff6ZkdW/NX5Xvt5I5/7fx96+Vdn38H+J7ZfR1ViZ/V85Inty6des/9APDZ0reCrsSPAAAAABJRU5ErkJggg=="
ISO_LOGO_DATA="iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAARVBMVEVHcExHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0f///8YF4JyAAAAD3RSTlMABf2Npdaf3un7YVkZCQQgjdC9AAAAUUlEQVQY02NgwAnYGBgYkNkEGMBoYmBiYDQDEwMTA+MDA0NDPYyMjIMjAwOhAakpGRgbGxsZCcgFyMjIAkoKyjIMmBmYGRhYIbCQ4gNFAAo4xMHf8cKvAAAAAElFTkSuQmCC"

months=(January February March April May June July August September October November December)

for ((i = START; i <= END; i++)); do
  # Stir the RNG differently for each iteration to improve variability.
  RANDOM=$((RANDOM ^ (i * 1103515245 + 12345)))

  id=$(printf "%0${DIGITS}d" "$i")
  company_name=$(random_choice company_names)
  report_title=$(random_choice report_titles)
  intro=$(random_choice intro_paragraphs)
  report_date_month=${months[$((RANDOM % ${#months[@]}))]}
  report_date_day=$((1 + RANDOM % 28))
  report_date_year=$((2020 + RANDOM % 6))
  report_date="${report_date_month} ${report_date_day}, ${report_date_year}"
  page_count=$(rand_between "${MIN_PAGES}" "${MAX_PAGES}")
  website_domain="$(slugify "${company_name}")"
  [[ -z "${website_domain}" ]] && website_domain="company"
  company_site="https://${website_domain}.com"
  phone=$(random_choice phone_numbers)
  opening_hours=$(random_choice opening_hours_options)

  xhtml="${OUTPUT_DIR}/${PREFIX}-${id}.xhtml"
  marker="${OUTPUT_DIR}/${PREFIX}-${id}.txt"

  {
    cat <<HTML
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8" />
<title>${company_name} ${report_title} ${id}</title>
<style type="text/css">
@page { size: A4 portrait; margin: 10mm 10mm 10mm 15mm; }
body { font-family: "Arial", sans-serif; font-size: 11pt; margin: 0; padding: 15mm; color: #1f1f1f; }
h1, h2 { color: #123c69; }
p { line-height: 1.5; }
table { width: 100%; border-collapse: collapse; margin: 12pt 0 18pt 0; }
th, td { border-bottom: 1px solid #b0b8c1; padding: 6px 10px; text-align: right; }
th { background: #e8eff7; text-align: left; }
.pagebreak { page-break-after: always; }
.logo { margin-bottom: 12pt; font-size: 0;}
.logo > * {display: inline-block; vertical-align: middle; font-size: 12pt;}
.logo > * + * {margin-left: 10px;}
.logo img { width: 20mm; height: 20mm; }
.meta { font-size: 10pt; color: #5a6472; }
footer { font-size: 9pt; text-align: center; margin-top: 24pt; color: #6d7885; }
</style>
</head>
<body>
<div class="logo">
<img src="data:image/png;base64,${COMPANY_LOGO_DATA}" alt="${company_name} logo" />
<div class="meta"><strong>${company_name}</strong><br />${report_title}<br />Report date: ${report_date}</div>
</div>
<h1>${report_title}</h1>
<p>${intro}</p>
HTML

    for ((page = 1; page <= page_count; page++)); do
      page_heading=$(random_choice page_topics)
      paragraph_one=$(random_choice narrative_blocks)
      paragraph_two=$(random_choice narrative_blocks)
      focus_template=$(random_choice deep_dive_focus)
      metric_value=$(awk -v seed=$((RANDOM + page + i)) -v base=$((50 + (i % 17))) 'BEGIN { srand(seed); printf "%.1f", base + rand() * 15 }')
      focus_paragraph=${focus_template/\{metric\}/${metric_value}}
      bullet_count=$(rand_between 3 5)
      mapfile -t bullet_items < <(pick_unique "${bullet_count}" "${action_checklist[@]}")

      col_count=$(rand_between "${MIN_COLS}" "${MAX_COLS}")
      row_count=$(rand_between "${MIN_ROWS}" "${MAX_ROWS}")
      mapfile -t selected_columns < <(pick_unique "${col_count}" "${column_pool[@]}")

      row_names=()
      for ((r = 0; r < row_count; r++)); do
        prefix=$(random_choice segment_prefixes)
        suffix=$(random_choice segment_suffixes)
        row_names+=("${prefix} ${suffix}")
      done

      cat <<HTML
<section>
<h2>${page_heading} - Page ${page} of ${page_count}</h2>
<p>${paragraph_one}</p>
<p>${paragraph_two}</p>
<p>${focus_paragraph}</p>
<ul>
HTML

      for bullet in "${bullet_items[@]}"; do
        printf '<li>%s</li>\n' "${bullet}"
      done

      cat <<HTML
</ul>
<table>
<thead>
<tr>
<th>Metric</th>
HTML

      for column in "${selected_columns[@]}"; do
        printf '<th>%s</th>\n' "${column}"
      done

      cat <<HTML
</tr>
</thead>
<tbody>
HTML

      for row_name in "${row_names[@]}"; do
        printf '<tr>\n<td>%s</td>\n' "${row_name}"
        for ((c = 0; c < ${#selected_columns[@]}; c++)); do
          value_integer=$((40 + RANDOM % 960))
          value_decimal=$(printf "%02d" $((RANDOM % 100)))
          printf '<td>%s.%s</td>\n' "${value_integer}" "${value_decimal}"
        done
        printf '</tr>\n'
      done

      cat <<HTML
</tbody>
</table>
<p><em>Insight:</em> ${focus_paragraph}</p>
</section>
HTML

      if ((page < page_count)); then
        cat <<HTML
<div class="pagebreak"></div>
HTML
      fi
    done

    closing=$(random_choice closing_notes)

    cat <<HTML
<footer>
<p><strong>${company_name}</strong> | <a href="${company_site}">${company_site}</a> | ${phone}</p>
<p>Opening hours: ${opening_hours}</p>
<p>${closing}</p>
<p><img src="data:image/png;base64,${ISO_LOGO_DATA}" alt="ISO Certification" style="width:18mm;height:18mm;" /></p>
</footer>
</body>
</html>
HTML
  } > "${xhtml}"

  : > "${marker}"
done
