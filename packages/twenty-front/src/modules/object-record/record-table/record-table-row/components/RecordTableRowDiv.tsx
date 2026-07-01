import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledTr = styled.div<{
  isDragging: boolean;
}>`
  border-top: ${({ isDragging }) =>
    isDragging ? `1px solid ${themeCssVariables.border.color.medium}` : 'none'};

  display: flex;
  flex-direction: row;

  &[data-focused='true'],
  &[data-active='true'] {
    div.table-cell,
    div.table-cell-0-0 {
      &:not(:first-of-type) {
        background-color: ${themeCssVariables.accent.quaternary};
        border-bottom: 1px solid ${themeCssVariables.border.color.medium};
        border-color: ${themeCssVariables.border.color.medium};
      }
      &:nth-of-type(2) {
        border-inline-start: 1px solid ${themeCssVariables.border.color.medium};

        margin-inline-start: -1px;

        div {
          margin-inline-start: -1px;
        }
      }
      &:last-of-type {
        border-inline-end: 1px solid ${themeCssVariables.border.color.medium};
        border-radius: 0 ${themeCssVariables.border.radius.sm}
          ${themeCssVariables.border.radius.sm} 0;
      }
    }
  }
`;

export const RecordTableRowDiv = StyledTr;
