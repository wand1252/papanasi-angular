import { onMount, useMetadata, useRef, useStore } from '@builder.io/mitosis';
import Choices from 'choices.js';
import { classesToString } from '../../../helpers';
import { SharedProps } from '../../../models';
import './choice.css';
import { choiceService } from './choice.service';

export type ChoiceProps = {
  disabled?: boolean;
} & SharedProps;

useMetadata({ isAttachedToShadowDom: true });

export default function Choice(props: ChoiceProps) {
  const choicesRef = useRef();

  const state = useStore({
    classes: '',
    onMounted() {
      const setInitialProps = (disabled, className) => {
        console.log(choiceService.options);
        const cities = new Choices(choicesRef, choiceService.options);

        state.classes = classesToString(['pa-choice', [disabled, 'is-disabled'], className || '']);
      };

      setInitialProps(props.disabled, props.className);
    }
  });

  onMount(() => state.onMounted());

  return (
    <div className={state.classes}>
      <label>Cities</label>
      <select ref={choicesRef} name="cities" id="cities">
        <option value="" data-key={1}>
          Choose a city
        </option>
        <option value="Leeds" data-key={2}>
          Leeds
        </option>
        <option value="Manchester" data-key={3}>
          Manchester
        </option>
        <option value="London" data-key={4}>
          London
        </option>
      </select>
    </div>
  );
}
