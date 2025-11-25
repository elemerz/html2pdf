#!/usr/bin/env bash
set -euo pipefail

# PARAMETERS -------------------------------------------------------------------
PREFIX="sample"                    # Base name for XHTML/marker pairs
START_INDEX=1                                # First numerical identifier (inclusive)
DIGITS=4                                     # Width of zero padding; 4 -> 0001..9999
OUTPUT_DIR="."                         # Destination folder for generated pairs
LEVEL_COUNT=2                                # Depth of folder tree below output dir
FOLDERS_PER_LEVEL=10                        # Subfolders created within each folder level
FILES_PER_FOLDER=3                           # XHTML samples generated per leaf folder
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

((LEVEL_COUNT < 0)) && LEVEL_COUNT=0
((FOLDERS_PER_LEVEL < 0)) && FOLDERS_PER_LEVEL=0
((FILES_PER_FOLDER < 0)) && FILES_PER_FOLDER=0

digits_for() {
  local number=$1
  local digits=0
  ((number < 0)) && number=$(( -number ))
  while ((number > 0)); do
    number=$((number / 10))
    ((digits++))
  done
  ((digits == 0)) && digits=1
  echo "${digits}"
}

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

COMPANY_LOGO_DATA="iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABR1BMVEVHcEwAAAAHExMMHhwJDg4AAAAMExUAAAAUKyoAAAAAAAAAAAAABAQ3VW0AAAABAgIaHRwODw8HCwsULS4nO0sAAAAAAAADCgkGBwgAAAAaODoaJzIfSkULNjEGCQt4//F6//Rr5NaGzf9t6NkmOTtv8eEiP06UjYvIvLkrVVJbi7F0+Oh3/e3///9gz8FKS0tUtqpBk4kuYls0cWr16OR8dnQVHhy+s7BDQUJk2cswSU1hl8A7hn2JgYBCYnxiX101Tl8qMDA7wrJLpZpbw7axrKpLcpBzu/Lh1NFoZmbw8PDWzcpWV1Zx9ORzs+Q+SVFlncgxsqMrJSZGm5ExenLMwsBopdSlm5h0//Js/u5DHybgSWNPq6Dw499Rg6pQepvX1tVF0cF+v/K7urqBxfm1NUubKz6ZlJOgn545a5N0KDX8U3BrJjJBuoRSAAAAH3RSTlMASM3GsgbHFdYONViX/iWN8t64++9oeqWfG+zi8OnwdQqZwAAAAmRJREFUOMttkldz2kAUhSUQoolqcMF2dlFFxUIFBIhuisGmVwPG3U79/88RZCaTCToze/Vwvt29umcR5B95/UQUdzjwaAh1ITY6O+GnSlOWm4p6QXhtgFBJhBCKklUY7fjQ9zoLAEgNnlcAgNfY4SVuTxKAJisIrAzAi9NlewIsVZ6EwBTanuDCZKZUZ4sCTav98YlNk9iU787L+TyXqmol4tBHI0b5rnXX6Vgla0R8By3gXD7VzVe3nV4+m0uXD5rYA6lOaru1ih2AoNHwfJvjslkutc2FMZ/NpLByz5ypqm5Ws6e2YRwbDQZACJip4bfzkaBHhsASVHC3LYD4j5Q+AEwjjNr7Xn84zeu6mY6g/6XtDvqCvjjhTNDz3HKZytUTTsLv+wsFQ55Y7PzLUaPAaNlMJrOt6n25oV84Q39+1X/eXry+D4SazsCHSS6TWRpNCCAQC+plfDefxKhi1gJmrRjQReqovuQmtAjEkqZK9y+XPuQMHxXTz2+tZ65ywz7AWbrazatQKkw+60lpNTtG4gFS6F5ZagXIR15q9m5v0wWpRK83a7q0GmMIJpCL4a0FlNvkgE2K/LylSX36Y/Nz82muxlHEMSLfa29X1r4FecPKUM12H6DIr39sfq211RhH8CJJVr597d0NB3ugUKcpAChl8jFRqPtrB0I8WQA3pDkLWLAUkLTZLg6Gr2si2AFo7JWsVGtPveEN+V23rCQF9gRlpbIDXKdtUjACRaNGjmiFSiYpa+20+1BjhzVoZ3tgPg5YoZiIeA60e/3B01i7OHoM4H73ofaBuVACd2DxM9sn8BuR+XN8yditeQAAAABJRU5ErkJggg=="
ISO_LOGO_DATA="iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAz1BMVEVHcEwAAAAAAAADDA8FGiBRuNQJHiMAAAAAAAAGDQ8KKTAATV0AAAAAAAAAAAAAAQIAAQEAAABLqMApW2gAAADzcoJj4P9h2/wlVWIbNDwE0vzdaHbpbn00dIVEIyfIXmpAHiJ3OD9f1vY3ICWNQkorY3Lvb3/vXHBFn7cgSVNiLjSyVmJVwN29WGPQY3BOJSlLrMc72f6qR1RZyugLcYfiUmXla3oFttwj1v0+kaY9ip6NMT0rJSsgEBIAWm0AYXUAgZsDv+ZClKrDR1gBocIT0rrUAAAAFXRSTlMAGYrD3f77NgH86/7aKW2umUE7uiA8qHmwAAACCklEQVQ4y4VT2ZLaMBA04IMbNonlQ7JkWb7lA8wNe2U3//9NkSCY1FYlnio/TbvV3TOjKPcazuaL6UjUdDGfDZWvNTSW6kR3PqLow9FtdWl8gfT64+1hmxXA80CReYU37vf+7huD18MxdTQgAUBzUlBEA+PRf1Lf3XWQncFGs21tA85ZAIKz+tT+P538XIPUOdkOw5g59klQgI09/cPRG7xNnCjNRv6lhAhBEuJRlkaOHQ2uOob9V9ddefrLZRebt9qHL7q3CqyoL70Y44O7BifWJNf+DVQ+n4AFivFMECy37hGsnpuE7BEnyEQlhxKxApalfVOUmXqQDi7JPi+p7zf73Md1ZZphFlhW8P2HMp+4rpX6uwTVvKYlDGuIaC504FRQ2HNl8e4eLfuSxAJAcp/T0DR5LZSEtmWB80JRf7nHjfMpAU1T0bzBBOZU6CTOxgIrVdGFBI3tEhPlPBcakBCSQ2EGMpF8oSujt+3WFhJME8ZxJfTHVYWkU4Rtz4tGD0AMkSkR8oMwbgH3JxBlOaSsrkKGSciq9om7SMI4Dv0yDzGnFPqkFSltBt5nAuv6pcGQ0pqEFGHS2rwGFfBdUmFMfCIYSioBbVC3qEVSpC5j4ZNQxjjKiYwaFOrsMaydGMCeV2JYRDjicljAWw47xm38d2GC28J0rlz30navfffhdJ9e9/H++/x/A06tZ8nd4zdPAAAAAElFTkSuQmCC"

months=(January February March April May June July August September October November December)

mkdir -p "${OUTPUT_DIR}"

total_leaves=1
if ((LEVEL_COUNT > 0 && FOLDERS_PER_LEVEL > 0)); then
  for ((lvl = 0; lvl < LEVEL_COUNT; lvl++)); do
    total_leaves=$((total_leaves * FOLDERS_PER_LEVEL))
  done
fi

total_samples=$((total_leaves * FILES_PER_FOLDER))
if ((total_samples > 0)); then
  max_id=$((START_INDEX + total_samples - 1))
else
  max_id=$((START_INDEX - 1))
fi

if ((total_samples > 0)); then
  required_digits=$(digits_for "${max_id}")
  if ((required_digits > DIGITS)); then
    DIGITS=$required_digits
  fi
fi

folder_digits=$(digits_for "${FOLDERS_PER_LEVEL}")
generated_count=0

generate_sample() {
  local i=$1
  local target_dir=$2

  mkdir -p "${target_dir}"

  # Stir the RNG differently for each iteration to improve variability.
  RANDOM=$((RANDOM ^ (i * 1103515245 + 12345)))

  local id
  id=$(printf "%0${DIGITS}d" "$i")
  local company_name
  company_name=$(random_choice company_names)
  local report_title
  report_title=$(random_choice report_titles)
  local intro
  intro=$(random_choice intro_paragraphs)
  local report_date_month report_date_day report_date_year report_date
  report_date_month=${months[$((RANDOM % ${#months[@]}))]}
  report_date_day=$((1 + RANDOM % 28))
  report_date_year=$((2020 + RANDOM % 6))
  report_date="${report_date_month} ${report_date_day}, ${report_date_year}"
  local page_count
  page_count=$(rand_between "${MIN_PAGES}" "${MAX_PAGES}")
  local website_domain
  website_domain="$(slugify "${company_name}")"
  [[ -z "${website_domain}" ]] && website_domain="company"
  local company_site="https://${website_domain}.com"
  local phone
  phone=$(random_choice phone_numbers)
  local opening_hours
  opening_hours=$(random_choice opening_hours_options)

  local xhtml="${target_dir}/${PREFIX}-${id}.xhtml"
  local marker="${target_dir}/${PREFIX}-${id}.txt"

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

    local page
    for ((page = 1; page <= page_count; page++)); do
      local page_heading
      page_heading=$(random_choice page_topics)
      local paragraph_one
      paragraph_one=$(random_choice narrative_blocks)
      local paragraph_two
      paragraph_two=$(random_choice narrative_blocks)
      local focus_template
      focus_template=$(random_choice deep_dive_focus)
      local metric_value
      metric_value=$(awk -v seed=$((RANDOM + page + i)) -v base=$((50 + (i % 17))) 'BEGIN { srand(seed); printf "%.1f", base + rand() * 15 }')
      local focus_paragraph="${focus_template/\{metric\}/${metric_value}}"
      local bullet_count
      bullet_count=$(rand_between 3 5)
      local -a bullet_items
      mapfile -t bullet_items < <(pick_unique "${bullet_count}" "${action_checklist[@]}")

      local col_count
      col_count=$(rand_between "${MIN_COLS}" "${MAX_COLS}")
      local row_count
      row_count=$(rand_between "${MIN_ROWS}" "${MAX_ROWS}")
      local -a selected_columns
      mapfile -t selected_columns < <(pick_unique "${col_count}" "${column_pool[@]}")

      local -a row_names=()
      local r
      for ((r = 0; r < row_count; r++)); do
        local prefix
        prefix=$(random_choice segment_prefixes)
        local suffix
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

      local bullet
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

      local column
      for column in "${selected_columns[@]}"; do
        printf '<th>%s</th>\n' "${column}"
      done

      cat <<HTML
</tr>
</thead>
<tbody>
HTML

      local row_name
      for row_name in "${row_names[@]}"; do
        printf '<tr>\n<td>%s</td>\n' "${row_name}"
        local c
        for ((c = 0; c < ${#selected_columns[@]}; c++)); do
          local value_integer=$((40 + RANDOM % 960))
          local value_decimal
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

    local closing
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
}

populate_folder_tree() {
  local level=$1
  local current_dir=$2

  mkdir -p "${current_dir}"

  if ((level >= LEVEL_COUNT || FOLDERS_PER_LEVEL == 0)); then
    if ((FILES_PER_FOLDER == 0 || total_samples == 0)); then
      return
    fi

    local file_idx sample_id
    for ((file_idx = 0; file_idx < FILES_PER_FOLDER && generated_count < total_samples; file_idx++)); do
      sample_id=$((START_INDEX + generated_count))
      generate_sample "${sample_id}" "${current_dir}"
      ((generated_count += 1))
    done
    return
  fi

  local folder_idx child_dir folder_name
  for ((folder_idx = 1; folder_idx <= FOLDERS_PER_LEVEL; folder_idx++)); do
    if ((generated_count >= total_samples && total_samples > 0)); then
      break
    fi
    printf -v folder_name "level-%d-%0${folder_digits}d" "$((level + 1))" "${folder_idx}"
    child_dir="${current_dir}/${folder_name}"
    populate_folder_tree "$((level + 1))" "${child_dir}"
  done
}

populate_folder_tree 0 "${OUTPUT_DIR}"
