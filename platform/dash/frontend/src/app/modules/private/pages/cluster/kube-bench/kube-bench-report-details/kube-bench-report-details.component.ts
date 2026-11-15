import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {KubeBenchService} from '../../../../../../core/services/kube-bench.service';
import {take, timeout} from 'rxjs/operators';
import {IKubeBenchLog} from '../../../../../../core/entities/IKubeBenchReport';

@Component({
  standalone: false,
  selector: 'app-kube-bench-report-details',
  templateUrl: './kube-bench-report-details.component.html',
  styleUrls: ['./kube-bench-report-details.component.scss'],
})
export class KubeBenchReportDetailsComponent implements OnInit {
  id: number;
  report: IKubeBenchLog;
  loading = false;
  loadError = '';

  constructor(
    private route: ActivatedRoute,
    private kubeBenchService: KubeBenchService,
  ) {}

  ngOnInit(): void {
    // Retain the original upstream single-report endpoint.
    // The report route :id is the audit ID, not the cluster ID.
    this.route.paramMap.subscribe(params => {
      const reportId = Number(params.get('id'));
      this.id = reportId;
      this.report = undefined;
      this.loadError = '';
      this.loading = true;
      if (!Number.isSafeInteger(reportId) || reportId <= 0) {
        this.loading = false;
        this.loadError = 'Invalid kube-bench report identifier.';
        return;
      }
      this.kubeBenchService.getKubeBenchReportById(reportId)
        .pipe(take(1), timeout(15000))
        .subscribe({
          next: reportDto => {
            this.loading = false;
            const result = reportDto?.resultsJson;
            if (result && Array.isArray(result.Controls) && result.Controls.length > 0 && result.Totals) {
              this.report = result;
            } else {
              this.loadError = 'This kube-bench audit returned no readable CIS controls or totals.';
            }
          },
          error: error => {
            this.loading = false;
            this.loadError = error?.name === 'TimeoutError'
              ? 'Kube-bench report request timed out. Check the Dashboard API.'
              : `Could not retrieve kube-bench report (HTTP ${error?.status || 'network error'}).`;
          },
        });
    });
  }
}
