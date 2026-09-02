# T2 Windows line-height probe collector.
# Opens each probe_*.docx in the corpus directory with Word COM, steps through
# the paragraph's lines with the Selection object, and records each line's
# vertical position into one JSON file. No UI: Word runs hidden, nothing saved.
#
# Run on a Windows box with Word installed:
#   powershell -ExecutionPolicy Bypass -File collect.ps1 -Corpus C:\path\to\probe-corpus
#
# Output: measurements.json next to the corpus (font slug, size, per-line Y in
# points). Reduce with reduce.mjs back on the dev machine.

param(
    [Parameter(Mandatory = $true)]
    [string]$Corpus
)

$ErrorActionPreference = 'Stop'

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0  # wdAlertsNone

$results = @()
try {
    $files = Get-ChildItem -Path $Corpus -Filter 'probe_*.docx' | Sort-Object Name
    if (-not $files) { throw "no probe_*.docx files in $Corpus" }

    foreach ($file in $files) {
        # probe_<sizePt>_<slug>.docx  (slug never contains '_')
        if ($file.BaseName -notmatch '^probe_([0-9.]+)_(.+)$') {
            Write-Warning "skipping unexpected name: $($file.Name)"
            continue
        }
        $sizePt = [double]$Matches[1]
        $slug = $Matches[2]

        $doc = $word.Documents.Open($file.FullName, $false, $true)  # ConfirmConversions, ReadOnly
        try {
            # The probe is ONE paragraph of soft-broken (<w:br/>) lines; the
            # reliable walker is GoTo by display line (wdGoToLine is
            # display-line-aware and lands on each soft break exactly once).
            $totalLines = $doc.ComputeStatistics(1)  # wdStatisticLines

            $ys = @()
            $baselineFont = $null
            for ($i = 1; $i -le $totalLines; $i++) {
                $line = $doc.GoTo(-1, 1, $i)  # wdGoToLine, wdGoToAbsolute
                $ys += [math]::Round($line.Information(6), 3)  # wdVerticalPositionRelativeToPage (points)
                if ($null -eq $baselineFont) {
                    $baselineFont = $line.Font.NameFarEast
                    if (-not $baselineFont) { $baselineFont = $line.Font.Name }
                }
            }

            $results += [ordered]@{
                slug = $slug
                sizePt = $sizePt
                font = $baselineFont
                lines = $totalLines
                ys = $ys
            }
            Write-Host ("collected {0}: {1}pt {2} -> {3} lines" -f $file.Name, $sizePt, $slug, $totalLines)
        }
        finally {
            $doc.Close($false)  # wdDoNotSaveChanges
        }
    }
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

$outPath = Join-Path $Corpus 'measurements.json'
$out = [ordered]@{
    # Windows build + Word version: substitution behavior differs by build, so
    # every factor table must name its provenance.
    os = [System.Environment]::OSVersion.VersionString
    wordVersion = $word.Version
    collectedAt = (Get-Date).ToUniversalTime().ToString('o')
    samples = $results
}
$out | ConvertTo-Json -Depth 4 | Set-Content -Path $outPath -Encoding UTF8
Write-Host "wrote $outPath ($($results.Count) samples)"
