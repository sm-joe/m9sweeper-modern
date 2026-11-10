import {Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import {take} from 'rxjs/operators';
import {MatTableDataSource} from '@angular/material/table';
import {FalcoLogOptions, FalcoService} from '../../../../../core/services/falco.service';
import {IFalcoLog} from '../../../../../core/entities/IFalcoLog';
import {AlertService} from 'src/app/core/services/alert.service';
import {UtilService} from '../../../../../core/services/util.service';

@Component({
  standalone: false,
  selector: 'app-falco-related-events-table',
  templateUrl: './falco-related-events-table.component.html',
  styleUrls: ['./falco-related-events-table.component.scss']
})
export class FalcoRelatedEventsTableComponent implements OnInit, OnChanges {
  @Input() clusterId: number;
  @Input() currentEventLogId: number | null;
  @Input() filters: Partial<FalcoLogOptions>;
  @Input() displayedColumns = ['is-current', 'calendar-date', 'namespace', 'pod', 'image', 'message'];
  @Input() stylingOptions = {
    tableBorder: true,
  };
  @Output() recentEventClicked = new EventEmitter<IFalcoLog>();

  relatedEventsTableData = new MatTableDataSource<IFalcoLog>([]);
  private latestRequestId = 0;

  limit = this.getLimitFromLocalStorage() ? Number(this.getLimitFromLocalStorage()) : 10;
  logCount: number;
  page: number;

  constructor(
    private alertService: AlertService,
    private falcoService: FalcoService,
    private utilService: UtilService,
  ) {}

  ngOnInit() {
    // Inputs have already triggered ngOnChanges by this point. Avoid a
    // competing second request that can overwrite the newest result.
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.clusterId && (changes['clusterId'] || changes['filters'])) {
      this.getRelatedEvents();
    }
  }

  getLimitFromLocalStorage(): string | null {
    return localStorage.getItem('falco_table_limit');
  }

  setLimitToLocalStorage(limit: number) {
    localStorage.setItem('falco_table_limit', String(limit));
  }

  pageEvent(pageEvent: any) {
    this.limit = pageEvent.pageSize;
    this.page = pageEvent.pageIndex;
    this.setLimitToLocalStorage(this.limit);
    this.getRelatedEvents();
  }

  getRelatedEvents() {
    if (!this.clusterId) {
      return;
    }
    const requestId = ++this.latestRequestId;
    const falcoLogFilterOptions = this.buildFalcoLogFilters();
    this.falcoService.getFalcoLogs(this.clusterId,  falcoLogFilterOptions)
      .pipe(take(1))
      .subscribe(response => {
        if (requestId !== this.latestRequestId) return;
        const dataList = response.data.list;
        // one less log count - without the current event log
        // current problem: we pop out the one that matches the id of the current event log
        // but if we say "-1", we remove the trigger that indicates there's another page
        this.logCount = response.data.logCount;

        const newDataList = [];
        dataList.forEach((eventLog) => {
          const modifiedEvent = eventLog as any;
          if (this.currentEventLogId) {
            modifiedEvent.isCurrent = eventLog.id === this.currentEventLogId;
          }
          modifiedEvent.image = typeof eventLog.image === 'string' && eventLog.image
            ? this.utilService.getImageName(eventLog.image) : 'Unknown';
          newDataList.push(modifiedEvent);
        });
        // Keep the data source instance bound to MatTable stable. Its .data setter
        // emits to the table immediately; replacing the object can leave a
        // previously-rendered table subscribed to an empty data source.
        this.relatedEventsTableData.data = newDataList;

      }, (err) => {
        if (requestId !== this.latestRequestId) return;
        if (err?.error?.message) {
          this.alertService.danger(err.error.message);
        } else if (err?.error) {
          this.alertService.danger(err.error);
        } else if (err?.message) {
          this.alertService.danger(err.message);
        } else {
          this.alertService.danger(err);
        }
      });
  }

  buildFalcoLogFilters(): FalcoLogOptions {
    const basicFilters = {
      limit: this.limit,
      page: this.page,
    };
    const omitEmpty = obj => {
      return Object.fromEntries(
        Object.entries(obj ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
      );
    };
    return {
      ...omitEmpty(this.filters),
      ...omitEmpty(basicFilters),
    };
  }

  rowClicked(row) {
    this.recentEventClicked.emit(row);
  }
}
