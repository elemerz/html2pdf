Param(
    [string]$Prefix = 'financial-sample',
    [int]$Start = 1,
    [int]$End = 10,
    [int]$Digits = 4,
    [string]$OutputDir = 'src/main/resources/html/samples',
    [int]$MinPages = 1,
    [int]$MaxPages = 10,
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

$companyLogoData = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAAAVFBMVEVHcEzSAxnhABzKBBjhABvYARngABrSAhjRAhnVAhnCBRjeABrDBRjiACrhACDhAC7hACfhACThAB3CBRjRAhzIBBroOFfdAR7lFjnxg5ftX3jrUWzx8D1CAAAADXRSTlMAdvNP3h69CJQ21F7wo2ktJAAAAgdJREFUWMPtlsuSgyAQRUVR8dU8NKjx//9zOgKKE4hmFrPyblJF5R5vNzSaJLdu3YqqRF1ZCyvPWIFiTe6tNe9rMTuhoIwoq+wao2pbO0FkVMEu2rxSN5tdKVBmLSb8L0gpBQp/AFJWJiQFaYErIyVxQpNK/Vwm0aFWBgDBtU5umQwh5q+o0vM8684KEZCi/5VGrokMglaRzWMKJq0n3vENgSaxAQwCCUW4iCoFvjw1d7IE4WQJryKyIIApuczzMnEfIaTwCSbCyIIVFDDNs5fAEmw7dgJGqEOnIaeALVwOgK0Z3SHC2FbhFmgMMPEgwWsCAvrsMoC/BwA1hAH0BLDvYxiAPZhegK57BxwDjI9gD3AX+HMFdKcB6uBJIgq0AXQnAXoWvgqwhuVXCYcA4AK0kWHAWdB4DkwCwwkVgAEiA50XimtTw0EHPxZQVx/mGcdxfSzvtqE8+oe+J/EbiQAOtLlQ/AC+P17AenW/roRJiPcCdn+8ANsGAHkg+BuI/jb7fC1X1BBEwD+g/1MDfIJ3jQg3gsMD/ez09VT+Jhj/OFz0u5eLlI4hnf2qf6vCakS3efxVPxKK0WkYjB39LSkvv97zYtj1WO193XzzhZAza3b2k/MTCEHah1G/iuVff6ZkdW/NX5Xvt5I5/7fx96+Vdn38H+J7ZfR1ViZ/V85Inty6des/9APDZ0reCrsSPAAAAABJRU5ErkJggg=='
$isoLogoData = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAARVBMVEVHcExHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0f///8YF4JyAAAAD3RSTlMABf2Npdaf3un7YVkZCQQgjdC9AAAAUUlEQVQY02NgwAnYGBgYkNkEGMBoYmBiYDQDEwMTA+MDA0NDPYyMjIMjAwOhAakpGRgbGxsZCcgFyMjIAkoKyjIMmBmYGRhYIbCQ4gNFAAo4xMHf8cKvAAAAAElFTkSuQmCC'

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

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

for ($i = $Start; $i -le $End; $i++) {
    $null = $script:Rng.Next()
    $id = $i.ToString("D$Digits")
    $companyName = Get-RandomItem $companyNames
    $reportTitle = Get-RandomItem $reportTitles
    $intro = Get-RandomItem $introParagraphs
    $reportDate = (Get-Date).AddDays(- (Get-RandomBetween -Min 0 -Max 180)).ToString('MMMM dd, yyyy')
    $pageCount = Get-RandomBetween -Min $MinPages -Max $MaxPages
    $domain = Get-Slug $companyName
    $companySite = "https://$domain.com"
    $phone = Get-RandomItem $phoneNumbers
    $openingHours = Get-RandomItem $openingHoursOptions

    $xhtmlPath = Join-Path $OutputDir "$Prefix-$id.xhtml"
    $markerPath = Join-Path $OutputDir "$Prefix-$id.txt"

    $titleText = [string]::Format("{0} {1} {2}", (Escape-HtmlText $companyName), (Escape-HtmlText $reportTitle), (Escape-HtmlText $id))

    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.AppendLine('<html xmlns="http://www.w3.org/1999/xhtml" lang="en">')
    [void]$builder.AppendLine('<head>')
    [void]$builder.AppendLine('<meta http-equiv="Content-Type" content="application/xhtml+xml; charset=UTF-8" />')
    [void]$builder.AppendLine([string]::Format('<title>{0}</title>', $titleText))
    [void]$builder.AppendLine('<style type="text/css">')
    [void]$builder.AppendLine('@page { size: A4 portrait; margin: 10mm 10mm 10mm 15mm; }')
    [void]$builder.AppendLine('body { font-family: "Arial", sans-serif; font-size: 11pt; margin: 0; padding: 15mm; color: #1f1f1f; }')
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
        $metricValue = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.0}", (50 + ($i % 17) + $script:Rng.NextDouble() * 15))
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
