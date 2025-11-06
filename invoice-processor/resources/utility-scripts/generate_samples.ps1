Param(
    [string]$Prefix = 'fin-sample',
    [int]$startIndex = 1,
    [int]$Digits = 4,
    [string]$OutputDir = '.',
    [int]$LevelCount = 0,
    [int]$FoldersPerLevel = 0,
    [int]$FilesPerFolder = 5000,
    [int]$MinPages = 1,
    [int]$MaxPages = 6,
    [int]$MinCols = 3,
    [int]$MaxCols = 6,
    [int]$MinRows = 4,
    [int]$MaxRows = 24
)

function Swap-IfNeeded {
    param([ref]$Low, [ref]$High)
    if ($High.Value -lt $Low.Value) {
        $tmp = $Low.Value
        $Low.Value = $High.Value
        $High.Value = $tmp
    }
}

Swap-IfNeeded ([ref]$MinPages) ([ref]$MaxPages)
Swap-IfNeeded ([ref]$MinCols) ([ref]$MaxCols)
Swap-IfNeeded ([ref]$MinRows) ([ref]$MaxRows)

if ($LevelCount -lt 0) { $LevelCount = 0 }
if ($FoldersPerLevel -lt 0) { $FoldersPerLevel = 0 }
if ($FilesPerFolder -lt 0) { $FilesPerFolder = 0 }

$seed = [int]([System.DateTime]::UtcNow.Ticks % [int]::MaxValue)
$script:Rng = [System.Random]::new($seed)

function Get-RandomBetween {
    param([int]$Min, [int]$Max)
    if ($Max -eq $Min) { return $Min }
    $low = [Math]::Min($Min, $Max)
    $high = [Math]::Max($Min, $Max)
    return $script:Rng.Next($low, $high + 1)
}

function Get-RandomItem {
    param([object[]]$Source)
    if (-not $Source -or $Source.Count -eq 0) { return '' }
    $index = $script:Rng.Next(0, $Source.Count)
    return $Source[$index]
}

function Get-UniqueSelection {
    param([object[]]$Source, [int]$Count)
    $pool = [System.Collections.Generic.List[object]]::new()
    $pool.AddRange($Source)
    $take = [Math]::Min($Count, $pool.Count)
    $picked = @()
    for ($i = 0; $i -lt $take; $i++) {
        $idx = $script:Rng.Next(0, $pool.Count)
        $picked += $pool[$idx]
        $pool.RemoveAt($idx)
    }
    return $picked
}

function Escape-HtmlText {
    param([string]$Value)
    if ($null -eq $Value) { return '' }
    return $Value.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;').Replace("'", '&#39;')
}

function Get-Slug {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return 'company' }
    $chars = New-Object System.Collections.Generic.List[char]
    foreach ($ch in $Value.ToLowerInvariant().ToCharArray()) {
        if (($ch -ge 'a' -and $ch -le 'z') -or ($ch -ge '0' -and $ch -le '9')) {
            $null = $chars.Add($ch)
        } elseif ($ch -eq ' ' -or $ch -eq '-' -or $ch -eq '_') {
            if ($chars.Count -eq 0 -or $chars[$chars.Count - 1] -ne '-') {
                $null = $chars.Add('-')
            }
        }
    }
    if ($chars.Count -eq 0) { return 'company' }
    $slug = -join $chars
    return $slug.Trim('-')
}

$companyLogoData = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABR1BMVEVHcEwAAAAHExMMHhwJDg4AAAAMExUAAAAUKyoAAAAAAAAAAAAABAQ3VW0AAAABAgIaHRwODw8HCwsULS4nO0sAAAAAAAADCgkGBwgAAAAaODoaJzIfSkULNjEGCQt4//F6//Rr5NaGzf9t6NkmOTtv8eEiP06UjYvIvLkrVVJbi7F0+Oh3/e3///9gz8FKS0tUtqpBk4kuYls0cWr16OR8dnQVHhy+s7BDQUJk2cswSU1hl8A7hn2JgYBCYnxiX101Tl8qMDA7wrJLpZpbw7axrKpLcpBzu/Lh1NFoZmbw8PDWzcpWV1Zx9ORzs+Q+SVFlncgxsqMrJSZGm5ExenLMwsBopdSlm5h0//Js/u5DHybgSWNPq6Dw499Rg6pQepvX1tVF0cF+v/K7urqBxfm1NUubKz6ZlJOgn545a5N0KDX8U3BrJjJBuoRSAAAAH3RSTlMASM3GsgbHFdYONViX/iWN8t64++9oeqWfG+zi8OnwdQqZwAAAAmRJREFUOMttkldz2kAUhSUQoolqcMF2dlFFxUIFBIhuisGmVwPG3U79/88RZCaTCToze/Vwvt29umcR5B95/UQUdzjwaAh1ITY6O+GnSlOWm4p6QXhtgFBJhBCKklUY7fjQ9zoLAEgNnlcAgNfY4SVuTxKAJisIrAzAi9NlewIsVZ6EwBTanuDCZKZUZ4sCTav98YlNk9iU787L+TyXqmol4tBHI0b5rnXX6Vgla0R8By3gXD7VzVe3nV4+m0uXD5rYA6lOaru1ih2AoNHwfJvjslkutc2FMZ/NpLByz5ypqm5Ws6e2YRwbDQZACJip4bfzkaBHhsASVHC3LYD4j5Q+AEwjjNr7Xn84zeu6mY6g/6XtDvqCvjjhTNDz3HKZytUTTsLv+wsFQ55Y7PzLUaPAaNlMJrOt6n25oV84Q39+1X/eXry+D4SazsCHSS6TWRpNCCAQC+plfDefxKhi1gJmrRjQReqovuQmtAjEkqZK9y+XPuQMHxXTz2+tZ65ywz7AWbrazatQKkw+60lpNTtG4gFS6F5ZagXIR15q9m5v0wWpRK83a7q0GmMIJpCL4a0FlNvkgE2K/LylSX36Y/Nz82muxlHEMSLfa29X1r4FecPKUM12H6DIr39sfq211RhH8CJJVr597d0NB3ugUKcpAChl8jFRqPtrB0I8WQA3pDkLWLAUkLTZLg6Gr2si2AFo7JWsVGtPveEN+V23rCQF9gRlpbIDXKdtUjACRaNGjmiFSiYpa+20+1BjhzVoZ3tgPg5YoZiIeA60e/3B01i7OHoM4H73ofaBuVACd2DxM9sn8BuR+XN8yditeQAAAABJRU5ErkJggg=='
$isoLogoData = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAz1BMVEVHcEwAAAAAAAADDA8FGiBRuNQJHiMAAAAAAAAGDQ8KKTAATV0AAAAAAAAAAAAAAQIAAQEAAABLqMApW2gAAADzcoJj4P9h2/wlVWIbNDwE0vzdaHbpbn00dIVEIyfIXmpAHiJ3OD9f1vY3ICWNQkorY3Lvb3/vXHBFn7cgSVNiLjSyVmJVwN29WGPQY3BOJSlLrMc72f6qR1RZyugLcYfiUmXla3oFttwj1v0+kaY9ip6NMT0rJSsgEBIAWm0AYXUAgZsDv+ZClKrDR1gBocIT0rrUAAAAFXRSTlMAGYrD3f77NgH86/7aKW2umUE7uiA8qHmwAAACCklEQVQ4y4VT2ZLaMBA04IMbNonlQ7JkWb7lA8wNe2U3//9NkSCY1FYlnio/TbvV3TOjKPcazuaL6UjUdDGfDZWvNTSW6kR3PqLow9FtdWl8gfT64+1hmxXA80CReYU37vf+7huD18MxdTQgAUBzUlBEA+PRf1Lf3XWQncFGs21tA85ZAIKz+tT+P538XIPUOdkOw5g59klQgI09/cPRG7xNnCjNRv6lhAhBEuJRlkaOHQ2uOob9V9ddefrLZRebt9qHL7q3CqyoL70Y44O7BifWJNf+DVQ+n4AFivFMECy37hGsnpuE7BEnyEQlhxKxApalfVOUmXqQDi7JPi+p7zf73Md1ZZphFlhW8P2HMp+4rpX6uwTVvKYlDGuIaC504FRQ2HNl8e4eLfuSxAJAcp/T0DR5LZSEtmWB80JRf7nHjfMpAU1T0bzBBOZU6CTOxgIrVdGFBI3tEhPlPBcakBCSQ2EGMpF8oSujt+3WFhJME8ZxJfTHVYWkU4Rtz4tGD0AMkSkR8oMwbgH3JxBlOaSsrkKGSciq9om7SMI4Dv0yDzGnFPqkFSltBt5nAuv6pcGQ0pqEFGHS2rwGFfBdUmFMfCIYSioBbVC3qEVSpC5j4ZNQxjjKiYwaFOrsMaydGMCeV2JYRDjicljAWw47xm38d2GC28J0rlz30navfffhdJ9e9/H++/x/A06tZ8nd4zdPAAAAAElFTkSuQmCC'

$companyNames = @(
    'Aurora Analytics',
    'Helios Holdings',
    'Meridian Ventures',
    'Nova Spectrum Group',
    'Summit Advisory',
    'Vertex Labs',
    'Blue Horizon Capital',
    'Trinity Ledger',
    'Atlas Financial',
    'Crestline Partners',
    'Vectorium Finance',
    'Pinnacle Ledger'
)

$reportTitles = @(
    'Quarterly Performance Review',
    'Strategic Revenue Outlook',
    'Operational Efficiency Digest',
    'Market Pulse Assessment',
    'Consolidated Growth Tracker',
    'Shareholder Insights Briefing',
    'Enterprise Value Synopsis'
)

$introParagraphs = @(
    'This report captures the momentum observed across our diversified portfolio, highlighting the levers contributing most to operating leverage.',
    'We continue to balance disciplined cost controls with selective investment, supporting resilient margins despite market volatility.',
    'Customer sentiment and recurring revenue streams remain strong as we accelerate digital engagement initiatives throughout the regions.',
    'Liquidity positions us to capitalise on near-term opportunities while sustaining longer-term innovation programmes in each division.',
    'The leadership team monitors these indicators weekly to ensure we maintain compliance, service excellence, and shareholder value.',
    'Core platforms remain resilient while adjacent services outpace expectations, expanding our blended lifetime value metrics.'
)

$narrativeBlocks = @(
    'Segment leaders noted improved throughput after automation upgrades, with fulfilment KPIs beating targets for the third consecutive month.',
    'Pipeline velocity reflects stronger partner contributions, reinforcing the case for expanding co-selling agreements in priority territories.',
    'Cost-to-serve metrics benefited from renegotiated logistics contracts, partially offsetting energy price pressure experienced in the quarter.',
    'Customer lifetime value is trending upward as cross-sell programmes gain traction in the enterprise and public sector verticals.',
    'Forecast accuracy improved following the rollout of the integrated planning playbook across operational teams.',
    'Compliance reviews confirmed adherence to ISO frameworks, with remediation actions completed ahead of the upcoming surveillance audit.',
    'The innovation council approved five new proofs of concept aligned with strategic themes in data intelligence and automation.',
    'Employee engagement surveys recorded record participation rates, informing refreshed well-being programmes launching next period.',
    'Working capital intensity improved sequentially as collections outpaced revenue recognition in three major regions.',
    'Deferred revenue continues to expand, supporting improved visibility into the next two fiscal quarters.'
)

$actionChecklist = @(
    'Deepen scenario planning for supply-side constraints',
    'Expand partner enablement for priority solution bundles',
    'Accelerate invoicing automation in low-margin streams',
    'Conduct quarterly talent calibration for analytics teams',
    'Advance sustainability disclosures for key stakeholders',
    'Standardise procurement scorecards across regions',
    'Pilot customer-success playbooks in growth accounts',
    'Revisit capital allocation for in-flight programmes',
    'Enhance risk dashboards with real-time leading indicators',
    'Align marketing narratives with refreshed value propositions',
    'Update service catalogues to reflect refreshed SLAs',
    'Consolidate tooling footprints across shared service teams'
)

$columnPool = @(
    'Actuals (EUR M)',
    'Forecast (EUR M)',
    'Variance (EUR M)',
    'Year Over Year %',
    'Run Rate (EUR M)',
    'Contribution Margin %',
    'Cash Position (EUR M)',
    'Backlog (EUR M)',
    'Operating Expense (EUR M)',
    'Bookings (EUR M)',
    'Pipeline (EUR M)',
    'Renewals %'
)

$segmentPrefixes = @(
    'Enterprise',
    'SMB',
    'Public Sector',
    'Channel',
    'Digital',
    'Operations',
    'Logistics',
    'Customer Care',
    'Innovation',
    'Services',
    'Analytics',
    'Platform'
)

$segmentSuffixes = @(
    'Momentum',
    'Allocation',
    'Performance',
    'Stability',
    'Expansion',
    'Velocity',
    'Productivity',
    'Satisfaction',
    'Utilisation',
    'Readiness',
    'Integrity'
)

$pageTopics = @(
    'Operating KPIs',
    'Regional Highlights',
    'Revenue Streams',
    'Customer Intelligence',
    'Operational Excellence',
    'Risk and Compliance',
    'Innovation Updates',
    'Talent and Culture',
    'Financial Controls',
    'Sustainability Outlook'
)

$deepDiveFocus = @(
    'Margin optimisation initiatives reduced blended cost-to-serve by {metric}% across core business units.',
    'Regional demand profiles indicate emerging opportunities in EMEA, balancing softer sentiment in APAC.',
    'Modernisation of legacy workflows created {metric} hours of reclaimed capacity delivered back to customer success teams.',
    'Cross-selling motions contributed {metric} incremental basis points to net retention during the trailing quarter.',
    'Scenario modelling highlights resilience under tightened capital expenditure environments, maintaining service continuity.',
    'Operational readiness drills validated the business continuity playbook and informed minor updates to recovery sequencing.'
)

$closingNotes = @(
    'Leadership will revisit these measures during the next steering committee to ensure alignment with strategic goals.',
    'Action plans will be tracked in the programme management office with weekly checkpoints across accountable owners.',
    'Risk mitigation activities remain on track with no material deviations from communicated remediation windows.',
    'Continued vigilance on cost discipline and talent retention will anchor execution priorities into the next quarter.'
)

$openingHoursOptions = @(
    'Mon-Fri 08:30-18:00 CET',
    'Mon-Thu 09:00-17:30 CET, Fri 09:00-16:00 CET',
    'Mon-Fri 08:00-17:00 CET, Sat by appointment',
    'Global support desk available 24/5'
)

$phoneNumbers = @(
    '+31 (0)20 555 0101',
    '+31 (0)20 555 0199',
    '+44 (0)20 8123 4455',
    '+49 (0)30 8800 2255'
)

[long]$totalLeaves = 1
if ($LevelCount -gt 0 -and $FoldersPerLevel -gt 0) {
    for ($levelIndex = 0; $levelIndex -lt $LevelCount; $levelIndex++) {
        $totalLeaves *= [long]$FoldersPerLevel
    }
}

[long]$totalSamples = $totalLeaves * [long]$FilesPerFolder
[long]$maxId = if ($totalSamples -gt 0) { [long]$startIndex + $totalSamples - 1 } else { [long]$startIndex - 1 }

if ($totalSamples -gt 0) {
    $requiredDigits = ($maxId.ToString()).Length
    if ($requiredDigits -gt $Digits) {
        $Digits = $requiredDigits
    }
}

$script:FolderDigits = [Math]::Max(1, ($FoldersPerLevel.ToString()).Length)
$script:FolderFormat = "D{0}" -f $script:FolderDigits
$script:TotalSamples = $totalSamples
$script:GeneratedCount = 0
$script:StartIndex = [long]$startIndex

function New-Sample {
    param(
        [long]$Id,
        [string]$TargetDir
    )

    if (-not (Test-Path -LiteralPath $TargetDir)) {
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    }

    $null = $script:Rng.Next()
    $idText = $Id.ToString("D$Digits")
    $companyName = Get-RandomItem $companyNames
    $reportTitle = Get-RandomItem $reportTitles
    $intro = Get-RandomItem $introParagraphs
    $reportDate = (Get-Date).AddDays(- (Get-RandomBetween -Min 0 -Max 180)).ToString('MMMM dd, yyyy')
    $pageCount = Get-RandomBetween -Min $MinPages -Max $MaxPages
    $domain = Get-Slug $companyName
    $companySite = "https://$domain.com"
    $phone = Get-RandomItem $phoneNumbers
    $openingHours = Get-RandomItem $openingHoursOptions

    $xhtmlPath = Join-Path $TargetDir "$Prefix-$idText.xhtml"
    $markerPath = Join-Path $TargetDir "$Prefix-$idText.txt"

    $titleText = [string]::Format("{0} {1} {2}", (Escape-HtmlText $companyName), (Escape-HtmlText $reportTitle), (Escape-HtmlText $idText))

    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.AppendLine('<html xmlns="http://www.w3.org/1999/xhtml" lang="en">')
    [void]$builder.AppendLine('<head>')
    [void]$builder.AppendLine('<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8" />')
    [void]$builder.AppendLine([string]::Format('<title>{0}</title>', $titleText))
    [void]$builder.AppendLine('<style type="text/css">')
    [void]$builder.AppendLine('@page { size: A4 portrait; margin: 10mm 10mm 10mm 15mm; }')
    [void]$builder.AppendLine('body { font-family: "Roboto", sans-serif; font-size: 11pt; margin: 0; padding: 15mm; color: #1f1f1f; }')
    [void]$builder.AppendLine('h1, h2 { color: #123c69; }')
    [void]$builder.AppendLine('p { line-height: 1.5; }')
    [void]$builder.AppendLine('table { width: 100%; border-collapse: collapse; margin: 12pt 0 18pt 0; }')
    [void]$builder.AppendLine('th, td { border-bottom: 1px solid #b0b8c1; padding: 6px 10px; text-align: right; }')
    [void]$builder.AppendLine('th { background: #e8eff7; text-align: left; }')
    [void]$builder.AppendLine('.pagebreak { page-break-after: always; }')
    [void]$builder.AppendLine('.logo { margin-bottom: 12pt; font-size: 0;}')
    [void]$builder.AppendLine('.logo > * {display: inline-block; vertical-align: middle; font-size: 12pt;}')
    [void]$builder.AppendLine('.logo > * + * {margin-left: 10px;}')
    [void]$builder.AppendLine('.logo img { width: 20mm; height: 20mm; }')
    [void]$builder.AppendLine('.meta { font-size: 10pt; color: #5a6472; }')
    [void]$builder.AppendLine('footer { font-size: 9pt; text-align: center; margin-top: 24pt; color: #6d7885; }')
    [void]$builder.AppendLine('</style>')
    [void]$builder.AppendLine('</head>')
    [void]$builder.AppendLine('<body>')
    [void]$builder.AppendLine('<div class="logo">')
    [void]$builder.AppendLine([string]::Format('<img src="data:image/png;base64,{0}" alt="{1} logo" />', $companyLogoData, (Escape-HtmlText $companyName)))
    [void]$builder.AppendLine([string]::Format('<div class="meta"><strong>{0}</strong><br />{1}<br />Report date: {2}</div>', (Escape-HtmlText $companyName), (Escape-HtmlText $reportTitle), (Escape-HtmlText $reportDate)))
    [void]$builder.AppendLine('</div>')
    [void]$builder.AppendLine([string]::Format('<h1>{0}</h1>', (Escape-HtmlText $reportTitle)))
    [void]$builder.AppendLine([string]::Format('<p>{0}</p>', (Escape-HtmlText $intro)))

    for ($page = 1; $page -le $pageCount; $page++) {
        $pageHeading = Escape-HtmlText (Get-RandomItem $pageTopics)
        $paragraphOne = Escape-HtmlText (Get-RandomItem $narrativeBlocks)
        $paragraphTwo = Escape-HtmlText (Get-RandomItem $narrativeBlocks)
        $focusTemplate = Get-RandomItem $deepDiveFocus
        $metricValue = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.0}", (50 + ($Id % 17) + $script:Rng.NextDouble() * 15))
        $focusParagraph = Escape-HtmlText ($focusTemplate -replace '\{metric\}', $metricValue)
        $bulletCount = Get-RandomBetween -Min 3 -Max 5
        $bulletItems = Get-UniqueSelection -Source $actionChecklist -Count $bulletCount
        $colCount = Get-RandomBetween -Min $MinCols -Max $MaxCols
        $rowCount = Get-RandomBetween -Min $MinRows -Max $MaxRows
        $selectedColumns = Get-UniqueSelection -Source $columnPool -Count $colCount

        $rowNames = @()
        for ($r = 0; $r -lt $rowCount; $r++) {
            $prefix = Get-RandomItem $segmentPrefixes
            $suffix = Get-RandomItem $segmentSuffixes
            $rowNames += Escape-HtmlText "$prefix $suffix"
        }

        [void]$builder.AppendLine('<section>')
        [void]$builder.AppendLine([string]::Format('<h2>{0} - Page {1} of {2}</h2>', $pageHeading, $page, $pageCount))
        [void]$builder.AppendLine([string]::Format('<p>{0}</p>', $paragraphOne))
        [void]$builder.AppendLine([string]::Format('<p>{0}</p>', $paragraphTwo))
        [void]$builder.AppendLine([string]::Format('<p>{0}</p>', $focusParagraph))
        [void]$builder.AppendLine('<ul>')
        foreach ($bullet in $bulletItems) {
            [void]$builder.AppendLine([string]::Format('<li>{0}</li>', (Escape-HtmlText $bullet)))
        }
        [void]$builder.AppendLine('</ul>')
        [void]$builder.AppendLine('<table>')
        [void]$builder.AppendLine('<thead>')
        [void]$builder.AppendLine('<tr>')
        [void]$builder.AppendLine('<th>Metric</th>')
        foreach ($col in $selectedColumns) {
            [void]$builder.AppendLine([string]::Format('<th>{0}</th>', (Escape-HtmlText $col)))
        }
        [void]$builder.AppendLine('</tr>')
        [void]$builder.AppendLine('</thead>')
        [void]$builder.AppendLine('<tbody>')
        foreach ($rowName in $rowNames) {
            [void]$builder.AppendLine('<tr>')
            [void]$builder.AppendLine([string]::Format('<td>{0}</td>', $rowName))
            foreach ($col in $selectedColumns) {
                $value = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.00}", (40 + $script:Rng.NextDouble() * 960))
                [void]$builder.AppendLine([string]::Format('<td>{0}</td>', $value))
            }
            [void]$builder.AppendLine('</tr>')
        }
        [void]$builder.AppendLine('</tbody>')
        [void]$builder.AppendLine('</table>')
        [void]$builder.AppendLine([string]::Format('<p><em>Insight:</em> {0}</p>', $focusParagraph))
        [void]$builder.AppendLine('</section>')

        if ($page -lt $pageCount) {
            [void]$builder.AppendLine('<div class="pagebreak"></div>')
        }
    }

    $closing = Escape-HtmlText (Get-RandomItem $closingNotes)

    [void]$builder.AppendLine('<footer>')
    [void]$builder.AppendLine([string]::Format('<p><strong>{0}</strong> | <a href="{1}">{1}</a> | {2}</p>', (Escape-HtmlText $companyName), (Escape-HtmlText $companySite), (Escape-HtmlText $phone)))
    [void]$builder.AppendLine([string]::Format('<p>Opening hours: {0}</p>', (Escape-HtmlText $openingHours)))
    [void]$builder.AppendLine([string]::Format('<p>{0}</p>', $closing))
    [void]$builder.AppendLine([string]::Format('<p><img src="data:image/png;base64,{0}" alt="ISO Certification" style="width:18mm;height:18mm;" /></p>', $isoLogoData))
    [void]$builder.AppendLine('</footer>')
    [void]$builder.AppendLine('</body>')
    [void]$builder.AppendLine('</html>')

    $builder.ToString() | Set-Content -LiteralPath $xhtmlPath -Encoding UTF8
    New-Item -ItemType File -Path $markerPath -Force | Out-Null
}

function Invoke-TreePopulation {
    param(
        [int]$Level,
        [string]$CurrentDir
    )

    if (-not (Test-Path -LiteralPath $CurrentDir)) {
        New-Item -ItemType Directory -Path $CurrentDir -Force | Out-Null
    }

    if ($script:TotalSamples -le 0) { return }

    if ($Level -ge $LevelCount -or $FoldersPerLevel -eq 0) {
        if ($FilesPerFolder -le 0) { return }

        for ($fileIdx = 0; $fileIdx -lt $FilesPerFolder -and $script:GeneratedCount -lt $script:TotalSamples; $fileIdx++) {
            $id = $script:StartIndex + $script:GeneratedCount
            New-Sample -Id $id -TargetDir $CurrentDir
            $script:GeneratedCount++
        }
        return
    }

    for ($folderIdx = 1; $folderIdx -le $FoldersPerLevel; $folderIdx++) {
        if ($script:GeneratedCount -ge $script:TotalSamples) { break }
        $folderIndex = $folderIdx.ToString($script:FolderFormat)
        $folderName = "level-{0}-{1}" -f ($Level + 1), $folderIndex
        $childDir = Join-Path $CurrentDir $folderName
        Invoke-TreePopulation -Level ($Level + 1) -CurrentDir $childDir
    }
}

Invoke-TreePopulation -Level 0 -CurrentDir $OutputDir
