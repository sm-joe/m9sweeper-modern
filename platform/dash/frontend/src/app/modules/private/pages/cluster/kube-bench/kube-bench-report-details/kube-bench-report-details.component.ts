import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {KubeBenchService} from '../../../../../../core/services/kube-bench.service';
import {take} from 'rxjs/operators';
import {IKubeBenchLog, IKubeBenchReport} from '../../../../../../core/entities/IKubeBenchReport';

@Component({
  standalone: false,
  selector: 'app-kube-bench-report-details',
  templateUrl: './kube-bench-report-details.component.html',
  styleUrls: ['./kube-bench-report-details.component.scss'],
})
export class KubeBenchReportDetailsComponent implements OnInit {
  id: number;
  report: IKubeBenchLog;
  loading = true;
  loadError = '';

  constructor(
    private route: ActivatedRoute,
    private kubeBenchService: KubeBenchService,
  ) {}

  ngOnInit(): void {
    // The parent :id is a CLUSTER id, whereas the current route :id is
    // the REPORT id. The cluster-scoped list endpoint is already verified
    // to return the complete report including its Controls and Totals.
    const clusterId = Number(this.route.parent?.snapshot.paramMap.get('id'));
    this.route.paramMap.subscribe(params => {
      this.id = Number(params.get('id'));
      this.report = undefined;
      this.loadError = '';
      this.loading = true;
      if (!Number.isSafeInteger(clusterId) || clusterId <= 0 ||
          !Number.isSafeInteger(this.id) || this.id <= 0) {
        this.loading = false;
        this.loadError = 'Invalid cluster or kube-bench report identifier.';
        return;
      }
      this.loadReport(clusterId, this.id);
    });
  }

  private loadReport(clusterId: number, reportId: number): void {
    // This route must never accidentally display a report from another
    // cluster. Resolve report details from the same cluster-authorized
    // endpoint that populates Past Audits.
    this.kubeBenchService.getAllBenchReportsByCluster(clusterId, 100, 0)
      .pipe(take(1))
      .subscribe({
        next: response => {
          const item: IKubeBenchReport = response?.list?.find(row =>
            Number(row.id) === reportId && Number(row.clusterId) === clusterId);
          this.loading = false;
          if (item?.resultsJson && Array.isArray(item.resultsJson.Controls)) {
            this.report = item.resultsJson;
          } else {
            this.loadError = response?.reportCount > 100
              ? 'This audit is outside the first 100 reports. Open it from a more recent audit page.'
              : 'The selected audit has no readable CIS controls for this cluster.';
          }
        },
        error: error => {
          this.loading = false;
          this.loadError = `Unable to load kube-bench report (HTTP ${error.status || 'network error'}).`;
        },
      });
  }
}
