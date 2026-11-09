import {Directive, ElementRef} from '@angular/core';

@Directive({
  standalone: false,
  selector: '[appUserProfileImage]'
})
export class UserProfileImageDirective {

  constructor(private el: ElementRef<HTMLImageElement>) {
  }

}
